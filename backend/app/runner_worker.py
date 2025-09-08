import json, sys, time, traceback


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "stdout": "",
                    "stderr": "invalid json",
                    "wall_ms": 0,
                }
            )
        )
        return
    files = payload.get("files", {})
    language = payload.get("language", "python")
    entry = payload.get("entrypoint", "main.py")
    start = time.time()
    stdout = []
    stderr = []
    if language != "python":
        print(
            json.dumps(
                {
                    "status": "failed",
                    "stdout": "",
                    "stderr": f"unsupported language {language}",
                    "wall_ms": 0,
                }
            )
        )
        return
    # Execute by building an in-memory module namespace
    ns = {"__name__": "__main__"}
    code = files.get(entry)
    if code is None:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "stdout": "",
                    "stderr": f"entrypoint {entry} not found",
                    "wall_ms": 0,
                }
            )
        )
        return
    try:
        # Provide a minimal file loader for relative imports among provided files
        import types, builtins

        module_cache = {}

        def load_module(path):
            if path in module_cache:
                return module_cache[path]
            src = files.get(path)
            if src is None:
                raise ImportError(path)
            m = types.ModuleType(path.rstrip(".py"))
            module_cache[path] = m
            exec(src, m.__dict__)
            return m

        real_print = print

        def capture_print(*a, **k):
            s = " ".join(str(x) for x in a)
            stdout.append(s)

        builtins.print = capture_print
        exec(code, ns)
        status = "succeeded"
    except SystemExit:
        status = "succeeded"
    except Exception:
        status = "failed"
        stderr.append(traceback.format_exc())
    wall_ms = int((time.time() - start) * 1000)
    # restore original print so final JSON isn't captured
    import builtins as _b

    _b.print = real_print
    print(
        json.dumps(
            {
                "status": status,
                "stdout": "\n".join(stdout),
                "stderr": "\n".join(stderr),
                "wall_ms": wall_ms,
            }
        )
    )


if __name__ == "__main__":
    main()
