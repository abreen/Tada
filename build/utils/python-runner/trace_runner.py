#!/usr/bin/env python3

import io
import json
import os
import pdb
import sys
import types


class CaptureStream(io.TextIOBase):
    def __init__(self, sink):
        self._sink = sink

    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        self._sink.append(s)
        return len(s)

    def flush(self):
        return None

    def isatty(self):
        return False


class TracePdb(pdb.Pdb):
    def __init__(self, target_path, trace_writer, output_chunks):
        super().__init__(nosigint=True, readrc=False)
        self.target_path = os.path.abspath(target_path)
        self.trace_writer = trace_writer
        self.output_chunks = output_chunks
        self.pending_snapshot = None
        self.object_ids = {}
        self.next_object_id = 1

    def user_line(self, frame):
        if not self._is_traced_frame(frame):
            self.set_step()
            return

        snapshot = self._capture_snapshot(frame)
        self._emit_pending()
        self.pending_snapshot = snapshot
        self.set_step()

    def user_call(self, frame, argument_list):
        if self._is_traced_frame(frame):
            self.set_step()

    def user_return(self, frame, return_value):
        if self._is_traced_frame(frame):
            snapshot = self._capture_snapshot(frame)
            self._emit_pending()
            self.pending_snapshot = snapshot
            self.set_step()

    def user_exception(self, frame, exc_info):
        if self._is_traced_frame(frame):
            self.set_step()

    def flush_pending(self):
        self._emit_pending()

    def _emit_pending(self):
        if self.pending_snapshot is None:
            return
        payload = dict(self.pending_snapshot)
        payload["stdout"] = self._drain_output()
        self.trace_writer.write(json.dumps(payload) + "\n")
        self.trace_writer.flush()
        self.pending_snapshot = None

    def _drain_output(self):
        if not self.output_chunks:
            return ""
        output = "".join(self.output_chunks)
        self.output_chunks.clear()
        return output

    def _capture_snapshot(self, frame):
        reachable = {}
        return {
            "line": frame.f_lineno,
            "file": os.path.basename(frame.f_code.co_filename),
            "stack": self._serialize_stack(frame, reachable),
            "heap": self._serialize_heap(reachable),
        }

    def _serialize_stack(self, frame, reachable):
        frames = []
        current = frame
        while current is not None:
            if self._is_traced_frame(current):
                locals_json = {}
                for name, value in current.f_locals.items():
                    if self._should_skip_local(name, value):
                        continue
                    locals_json[name] = self._serialize_value(value, reachable)
                frames.append(
                    {
                        "method": current.f_code.co_name,
                        "class": "Python",
                        "line": current.f_lineno,
                        "locals": locals_json,
                    }
                )
            current = current.f_back
        return frames

    def _serialize_heap(self, reachable):
        heap = {}
        queue = list(reachable.items())
        seen = set()
        idx = 0
        while idx < len(queue):
            obj_id, obj = queue[idx]
            idx += 1
            if obj_id in seen:
                continue
            seen.add(obj_id)
            heap[obj_id] = self._serialize_heap_object(obj, reachable)
            for new_id, new_obj in reachable.items():
                if new_id not in seen:
                    queue.append((new_id, new_obj))
        return heap

    def _serialize_heap_object(self, obj, reachable):
        if isinstance(obj, str):
            return {"type": "String", "value": obj}

        if isinstance(obj, (list, tuple)):
            return {
                "type": type(obj).__name__,
                "elements": [self._serialize_value(value, reachable) for value in obj],
            }

        if isinstance(obj, dict) and all(isinstance(key, str) for key in obj.keys()):
            return {
                "type": "dict",
                "fields": {
                    key: self._serialize_value(value, reachable)
                    for key, value in obj.items()
                },
            }

        obj_dict = getattr(obj, "__dict__", None)
        if isinstance(obj_dict, dict):
            return {
                "type": type(obj).__name__,
                "fields": {
                    key: self._serialize_value(value, reachable)
                    for key, value in obj_dict.items()
                    if not key.startswith("__") and not self._should_skip_local(key, value)
                },
            }

        return {"type": type(obj).__name__, "value": self._safe_repr(obj)}

    def _serialize_value(self, value, reachable):
        if value is None:
            return {"type": "null"}
        if isinstance(value, bool):
            return {"type": "boolean", "value": value}
        if isinstance(value, int) and not isinstance(value, bool):
            return {"type": "int", "value": value}
        if isinstance(value, float):
            return {"type": "double", "value": value}
        if isinstance(value, str):
            obj_id = self._get_object_id(value)
            reachable.setdefault(obj_id, value)
            return {"type": "ref", "id": obj_id}

        if self._is_heap_value(value):
            obj_id = self._get_object_id(value)
            reachable.setdefault(obj_id, value)
            return {"type": "ref", "id": obj_id}

        return {"type": "unknown"}

    def _is_heap_value(self, value):
        if isinstance(value, str):
            return True
        if isinstance(value, (list, tuple)):
            return True
        if isinstance(value, dict):
            return all(isinstance(key, str) for key in value.keys())
        obj_dict = getattr(value, "__dict__", None)
        return isinstance(obj_dict, dict)

    def _get_object_id(self, obj):
        key = id(obj)
        if key not in self.object_ids:
            self.object_ids[key] = f"obj_{self.next_object_id}"
            self.next_object_id += 1
        return self.object_ids[key]

    def _safe_repr(self, value):
        try:
            return repr(value)
        except Exception:
            return f"<{type(value).__name__}>"

    def _is_traced_frame(self, frame):
        return os.path.abspath(frame.f_code.co_filename) == self.target_path

    def _should_skip_local(self, name, value):
        if name.startswith("__"):
            return True
        if isinstance(value, (types.ModuleType, types.FunctionType, type)):
            return True
        return False


def main():
    if len(sys.argv) != 2:
        print("Usage: trace_runner.py <python_file>", file=sys.stderr)
        sys.exit(1)

    target_path = os.path.abspath(sys.argv[1])
    target_dir = os.path.dirname(target_path)
    target_name = os.path.basename(target_path)

    if target_dir and target_dir not in sys.path:
        sys.path.insert(0, target_dir)

    trace_writer = sys.stdout
    output_chunks = []
    capture = CaptureStream(output_chunks)
    debugger = TracePdb(target_path, trace_writer, output_chunks)

    code_globals = {
        "__name__": "__main__",
        "__file__": target_path,
        "__package__": None,
        "__cached__": None,
        "__builtins__": __builtins__,
    }

    original_stdout = sys.stdout
    original_stderr = sys.stderr

    try:
        with open(target_path, "r", encoding="utf-8") as f:
            source = f.read()
        compiled = compile(source, target_path, "exec")

        sys.stdout = capture
        sys.stderr = capture

        try:
            debugger.set_step()
            debugger.runcall(exec, compiled, code_globals, code_globals)
        except SystemExit:
            pass
        finally:
            debugger.flush_pending()
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr


if __name__ == "__main__":
    main()
