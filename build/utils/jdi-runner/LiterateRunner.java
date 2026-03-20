import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.util.*;

/**
 * Runs a Java class under JDI, stepping through main() line by line and
 * capturing stdout output per code block.
 *
 * Usage: java LiterateRunner <className> <classPath> <blockRangesJSON>
 *
 * blockRangesJSON is a JSON array of [startLine, endLine] pairs, e.g.:
 *   [[1,3],[5,10],[12,18]]
 *
 * Outputs a JSON array of [blockIndex, outputString] pairs to stdout.
 */
public class LiterateRunner {

    private static int[][] parseBlockRanges(String json) {
        json = json.trim();
        if (json.startsWith("'") || json.startsWith("\"")) {
            json = json.substring(1, json.length() - 1);
        }
        json = json.substring(1, json.length() - 1);

        var ranges = new ArrayList<int[]>();
        int i = 0;
        while (i < json.length()) {
            if (json.charAt(i) == '[') {
                int close = json.indexOf(']', i);
                String pair = json.substring(i + 1, close);
                String[] parts = pair.split(",");
                ranges.add(new int[] {
                        Integer.parseInt(parts[0].trim()),
                        Integer.parseInt(parts[1].trim())
                });
                i = close + 1;
            } else {
                i++;
            }
        }

        return ranges.toArray(new int[0][]);
    }

    private static int findBlock(int[][] ranges, int lineNumber) {
        for (int i = 0; i < ranges.length; i++) {
            if (lineNumber >= ranges[i][0] && lineNumber <= ranges[i][1]) {
                return i;
            }
        }
        return -1;
    }

    private static String drainStream(InputStream stream) throws IOException {
        var sb = new StringBuilder();
        while (stream.available() > 0) {
            sb.append((char) stream.read());
        }
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("Usage: java LiterateRunner <className> <classPath> <blockRangesJSON>");
            System.exit(1);
        }

        String className = args[0];
        String classPath = args[1];
        int[][] blockRanges = parseBlockRanges(args[2]);

        var blockOutput = new LinkedHashMap<Integer, StringBuilder>();

        // Launch the target VM
        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> connArgs = connector.defaultArguments();
        connArgs.get("main").setValue(className);
        connArgs.get("options").setValue("-cp " + classPath);

        VirtualMachine vm = connector.launch(connArgs);
        Process process = vm.process();
        InputStream targetStdout = process.getInputStream();
        InputStream targetStderr = process.getErrorStream();

        // Drain stderr in a background thread
        Thread stderrThread = new Thread(() -> {
            try {
                targetStderr.transferTo(System.err);
            } catch (IOException ignored) {
            }
        });
        stderrThread.setDaemon(true);
        stderrThread.start();

        int activeBlock = -1;

        try {
            // Set up class prepare request
            ClassPrepareRequest classPrepareReq = vm.eventRequestManager().createClassPrepareRequest();
            classPrepareReq.addClassFilter(className);
            classPrepareReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            classPrepareReq.enable();

            // Process the initial VMStartEvent, then resume
            EventSet startSet = vm.eventQueue().remove();
            startSet.resume();

            EventQueue eventQueue = vm.eventQueue();
            boolean running = true;

            while (running) {
                EventSet eventSet = eventQueue.remove();

                for (Event event : eventSet) {
                    if (event instanceof ClassPrepareEvent cpe) {
                        ReferenceType refType = cpe.referenceType();

                        // Find main method using only declared methods
                        Method mainMethod = null;
                        for (Method m : refType.methods()) {
                            if (m.name().equals("main") && m.returnTypeName().equals("void")) {
                                var argTypes = m.argumentTypeNames();
                                if (argTypes.isEmpty() ||
                                        (argTypes.size() == 1 && argTypes.get(0).equals("java.lang.String[]"))) {
                                    mainMethod = m;
                                    break;
                                }
                            }
                        }

                        if (mainMethod != null) {
                            List<Location> locations = mainMethod.allLineLocations();
                            if (!locations.isEmpty()) {
                                BreakpointRequest bp = vm.eventRequestManager()
                                        .createBreakpointRequest(locations.get(0));
                                bp.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                                bp.enable();
                            }
                        }

                        classPrepareReq.disable();

                    } else if (event instanceof BreakpointEvent bpe) {
                        ThreadReference thread = bpe.thread();
                        int line = bpe.location().lineNumber();
                        activeBlock = findBlock(blockRanges, line);

                        StepRequest stepReq = vm.eventRequestManager().createStepRequest(
                                thread, StepRequest.STEP_LINE, StepRequest.STEP_OVER);
                        stepReq.addClassFilter(className);
                        stepReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        stepReq.enable();

                        bpe.request().disable();

                    } else if (event instanceof StepEvent se) {
                        Thread.sleep(1);
                        String output = drainStream(targetStdout);
                        if (!output.isEmpty() && activeBlock >= 0) {
                            blockOutput.computeIfAbsent(activeBlock, k -> new StringBuilder())
                                    .append(output);
                        }

                        int line = se.location().lineNumber();
                        int newBlock = findBlock(blockRanges, line);
                        if (newBlock >= 0) {
                            activeBlock = newBlock;
                        }

                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        Thread.sleep(10);
                        String output = drainStream(targetStdout);
                        if (!output.isEmpty() && activeBlock >= 0) {
                            blockOutput.computeIfAbsent(activeBlock, k -> new StringBuilder())
                                    .append(output);
                        }
                        running = false;
                    }
                }

                if (running) {
                    eventSet.resume();
                }
            }
        } catch (VMDisconnectedException e) {
            // VM died unexpectedly, drain any remaining output
            Thread.sleep(10);
            String output = drainStream(targetStdout);
            if (!output.isEmpty() && activeBlock >= 0) {
                blockOutput.computeIfAbsent(activeBlock, k -> new StringBuilder())
                        .append(output);
            }
        } finally {
            try {
                vm.dispose();
            } catch (VMDisconnectedException ignored) {
            }
            stderrThread.join(1000);
        }

        // Output JSON to our own stdout
        var sb = new StringBuilder();
        sb.append('[');
        boolean first = true;
        for (var entry : blockOutput.entrySet()) {
            if (!first)
                sb.append(',');
            first = false;
            sb.append('[');
            sb.append(entry.getKey());
            sb.append(',');
            sb.append(jsonEscape(entry.getValue().toString()));
            sb.append(']');
        }
        sb.append(']');

        System.out.print(sb.toString());
    }

    private static String jsonEscape(String s) {
        var sb = new StringBuilder();
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

}
