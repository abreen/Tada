import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.util.*;

/**
 * Runs a Java class under JDI, stepping through execution line by line
 * and emitting a JSONL trace to stdout. Each line is a self-contained
 * JSON object representing one execution step with stack frames,
 * local variables, and reachable heap objects.
 *
 * Usage: java TraceRunner <className> <classPath>
 */
public class TraceRunner {

    private static final Map<Long, String> objectIdMap = new HashMap<>();
    private static long nextObjId = 1;
    private static Map<String, ObjectReference> previousReachable = new LinkedHashMap<>();

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: java TraceRunner <className> <classPath>");
            System.exit(1);
        }

        String className = args[0];
        String classPath = args[1];

        LaunchingConnector connector =
            Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> connArgs = connector.defaultArguments();
        connArgs.get("main").setValue(className);
        connArgs.get("options").setValue("-cp " + classPath);

        VirtualMachine vm = connector.launch(connArgs);
        Process process = vm.process();
        InputStream targetStdout = process.getInputStream();
        InputStream targetStderr = process.getErrorStream();

        Thread stderrThread = new Thread(() -> {
            try {
                targetStderr.transferTo(System.err);
            } catch (IOException ignored) {
            }
        });
        stderrThread.setDaemon(true);
        stderrThread.start();

        try {
            ClassPrepareRequest cpr =
                vm.eventRequestManager().createClassPrepareRequest();
            cpr.addClassFilter(className);
            cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
            cpr.enable();

            vm.eventQueue().remove().resume(); // consume VMStartEvent

            boolean running = true;
            while (running) {
                EventSet eventSet = vm.eventQueue().remove();
                for (Event event : eventSet) {
                    if (event instanceof ClassPrepareEvent cpe) {
                        Method mainMethod = findMainMethod(cpe.referenceType());
                        if (mainMethod != null) {
                            var locs = mainMethod.allLineLocations();
                            if (!locs.isEmpty()) {
                                var bp = vm.eventRequestManager()
                                    .createBreakpointRequest(locs.get(0));
                                bp.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                                bp.enable();
                            }
                        }
                        cpr.disable();

                    } else if (event instanceof BreakpointEvent bpe) {
                        emitState(bpe.thread(), targetStdout);

                        var step = vm.eventRequestManager().createStepRequest(
                            bpe.thread(),
                            StepRequest.STEP_LINE,
                            StepRequest.STEP_INTO);
                        step.addClassExclusionFilter("java.*");
                        step.addClassExclusionFilter("javax.*");
                        step.addClassExclusionFilter("jdk.*");
                        step.addClassExclusionFilter("sun.*");
                        step.addClassExclusionFilter("com.sun.*");
                        step.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        step.enable();
                        bpe.request().disable();

                    } else if (event instanceof StepEvent se) {
                        emitState(se.thread(), targetStdout);

                    } else if (event instanceof VMDeathEvent
                            || event instanceof VMDisconnectEvent) {
                        running = false;
                    }
                }
                if (running) {
                    eventSet.resume();
                }
            }
        } catch (VMDisconnectedException ignored) {
        } finally {
            try {
                vm.dispose();
            } catch (VMDisconnectedException ignored) {
            }
            stderrThread.join(1000);
        }
    }

    private static Method findMainMethod(ReferenceType type) {
        for (Method m : type.methods()) {
            if (m.name().equals("main") && m.returnTypeName().equals("void")) {
                var argTypes = m.argumentTypeNames();
                if (argTypes.isEmpty()
                        || (argTypes.size() == 1
                            && argTypes.get(0).equals("java.lang.String[]"))) {
                    return m;
                }
            }
        }
        return null;
    }

    private static void emitState(ThreadReference thread,
            InputStream targetStdout) throws Exception {
        Thread.sleep(1);
        String newStdout = drainStream(targetStdout);

        Location loc = thread.frame(0).location();
        int line = loc.lineNumber();
        String file = loc.sourceName();

        var reachable = new LinkedHashMap<String, ObjectReference>();
        String stackJson = serializeStack(thread, reachable);

        // Carry forward objects from the previous step that are still alive.
        // This keeps in-flight objects (e.g., on the operand stack during
        // chained constructor calls) visible in the diagram.
        for (var entry : previousReachable.entrySet()) {
            if (!reachable.containsKey(entry.getKey())) {
                try {
                    if (!entry.getValue().isCollected()) {
                        reachable.put(entry.getKey(), entry.getValue());
                    }
                } catch (Exception ignored) {
                }
            }
        }

        String heapJson = serializeHeap(reachable);
        previousReachable = new LinkedHashMap<>(reachable);

        System.out.println(
            "{\"line\":" + line
            + ",\"file\":\"" + jsonEscape(file)
            + "\",\"stack\":" + stackJson
            + ",\"heap\":" + heapJson
            + ",\"stdout\":\"" + jsonEscape(newStdout) + "\"}");
        System.out.flush();
    }

    private static String serializeStack(ThreadReference thread,
            Map<String, ObjectReference> reachable) throws Exception {
        var sb = new StringBuilder("[");
        boolean first = true;
        for (StackFrame frame : thread.frames()) {
            ReferenceType declType = frame.location().declaringType();
            if (!isUserClass(declType)) {
                continue;
            }
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append("{\"method\":\"")
                .append(jsonEscape(frame.location().method().name()))
                .append("\",\"class\":\"")
                .append(jsonEscape(declType.name()))
                .append("\",\"line\":")
                .append(frame.location().lineNumber())
                .append(",\"locals\":{");

            boolean firstVar = true;

            // Emit 'this' for instance methods
            if (!frame.location().method().isStatic()) {
                try {
                    ObjectReference thisObj = frame.thisObject();
                    if (thisObj != null) {
                        sb.append("\"this\":")
                            .append(serializeValue(thisObj, reachable));
                        firstVar = false;
                    }
                } catch (Exception ignored) {
                }
            }

            try {
                // Get ALL locals declared in the method
                var allVars = frame.location().method().variables();
                // Get the set of currently visible (initialized) variables
                var visibleVars = new HashSet<LocalVariable>();
                try {
                    visibleVars.addAll(frame.visibleVariables());
                } catch (AbsentInformationException ignored) {
                }
                // Track names we've already emitted (avoid duplicates from scopes)
                var emittedNames = new HashSet<String>();
                for (LocalVariable lv : allVars) {
                    if (emittedNames.contains(lv.name())) {
                        continue;
                    }
                    emittedNames.add(lv.name());
                    if (!firstVar) {
                        sb.append(',');
                    }
                    firstVar = false;
                    sb.append("\"").append(jsonEscape(lv.name())).append("\":");
                    if (visibleVars.contains(lv)) {
                        Value val = frame.getValue(lv);
                        sb.append(serializeValue(val, reachable));
                    } else {
                        // Variable declared but not yet initialized
                        sb.append("{\"type\":\"uninitialized\"}");
                    }
                }
            } catch (AbsentInformationException ignored) {
            }

            sb.append("}}");
        }
        sb.append(']');
        return sb.toString();
    }

    private static String serializeValue(Value val,
            Map<String, ObjectReference> reachable) {
        if (val == null) {
            return "{\"type\":\"null\"}";
        }
        if (val instanceof BooleanValue v) {
            return "{\"type\":\"boolean\",\"value\":" + v.value() + "}";
        }
        if (val instanceof ByteValue v) {
            return "{\"type\":\"byte\",\"value\":" + v.value() + "}";
        }
        if (val instanceof CharValue v) {
            return "{\"type\":\"char\",\"value\":\""
                + jsonEscape(String.valueOf(v.value())) + "\"}";
        }
        if (val instanceof DoubleValue v) {
            return "{\"type\":\"double\",\"value\":" + v.value() + "}";
        }
        if (val instanceof FloatValue v) {
            return "{\"type\":\"float\",\"value\":" + v.value() + "}";
        }
        if (val instanceof IntegerValue v) {
            return "{\"type\":\"int\",\"value\":" + v.value() + "}";
        }
        if (val instanceof LongValue v) {
            return "{\"type\":\"long\",\"value\":" + v.value() + "}";
        }
        if (val instanceof ShortValue v) {
            return "{\"type\":\"short\",\"value\":" + v.value() + "}";
        }
        if (val instanceof ObjectReference obj) {
            String id = getObjectId(obj);
            reachable.putIfAbsent(id, obj);
            return "{\"type\":\"ref\",\"id\":\"" + id + "\"}";
        }
        return "{\"type\":\"unknown\"}";
    }

    private static String serializeHeap(
            Map<String, ObjectReference> reachable) {
        var sb = new StringBuilder("{");
        var processed = new HashSet<String>();
        var queue = new ArrayList<>(reachable.keySet());
        boolean first = true;
        int idx = 0;

        while (idx < queue.size()) {
            String id = queue.get(idx++);
            if (processed.contains(id)) {
                continue;
            }
            processed.add(id);

            ObjectReference obj = reachable.get(id);
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append("\"").append(id).append("\":");
            sb.append(serializeHeapObject(obj, reachable));

            // Discover newly reachable objects
            for (String newId : reachable.keySet()) {
                if (!processed.contains(newId) && !queue.contains(newId)) {
                    queue.add(newId);
                }
            }
        }
        sb.append('}');
        return sb.toString();
    }

    private static String serializeHeapObject(ObjectReference obj,
            Map<String, ObjectReference> reachable) {
        if (obj instanceof StringReference str) {
            return "{\"type\":\"String\",\"value\":\""
                + jsonEscape(str.value()) + "\"}";
        }
        if (obj instanceof ArrayReference arr) {
            var sb = new StringBuilder("{\"type\":\"")
                .append(jsonEscape(arr.referenceType().name()))
                .append("\",\"elements\":[");
            int limit = Math.min(arr.length(), 100);
            for (int i = 0; i < limit; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append(serializeValue(arr.getValue(i), reachable));
            }
            if (arr.length() > limit) {
                sb.append(",{\"type\":\"truncated\",\"remaining\":")
                    .append(arr.length() - limit).append('}');
            }
            sb.append("]}");
            return sb.toString();
        }

        ReferenceType type = obj.referenceType();
        if (!isUserClass(type)) {
            // JDK object: show type name and toString value
            try {
                return "{\"type\":\"" + jsonEscape(type.name())
                    + "\",\"value\":\"" + jsonEscape(obj.toString()) + "\"}";
            } catch (Exception e) {
                return "{\"type\":\"" + jsonEscape(type.name()) + "\"}";
            }
        }

        // User object: show fields
        var sb = new StringBuilder("{\"type\":\"")
            .append(jsonEscape(type.name()))
            .append("\",\"fields\":{");
        boolean first = true;
        try {
            for (Field field : type.visibleFields()) {
                if (field.isStatic()) {
                    continue;
                }
                if (!first) {
                    sb.append(',');
                }
                first = false;
                sb.append("\"").append(jsonEscape(field.name())).append("\":");
                sb.append(serializeValue(obj.getValue(field), reachable));
            }
        } catch (Exception ignored) {
        }
        sb.append("}}");
        return sb.toString();
    }

    private static String getObjectId(ObjectReference obj) {
        return objectIdMap.computeIfAbsent(
            obj.uniqueID(), k -> "obj_" + nextObjId++);
    }

    private static boolean isUserClass(ReferenceType type) {
        String name = type.name();
        return !name.startsWith("java.")
            && !name.startsWith("javax.")
            && !name.startsWith("jdk.")
            && !name.startsWith("sun.")
            && !name.startsWith("com.sun.");
    }

    private static String drainStream(InputStream stream) throws IOException {
        var sb = new StringBuilder();
        while (stream.available() > 0) {
            sb.append((char) stream.read());
        }
        return sb.toString();
    }

    private static String jsonEscape(String s) {
        var sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append("\\u")
                            .append(String.format("%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.toString();
    }
}
