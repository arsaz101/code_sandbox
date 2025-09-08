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
    if language == "python":
        # Execute by building an in-memory module namespace
        ns = {"__name__": "__main__"}
        try:
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
        finally:
            import builtins as _b

            _b.print = real_print
    elif language == "javascript":
        # Execute via node if available
        import subprocess, tempfile, os

        try:
            with tempfile.TemporaryDirectory() as td:
                # write all files
                for p, src in files.items():
                    fp = os.path.join(td, p)
                    os.makedirs(os.path.dirname(fp), exist_ok=True)
                    with open(fp, "w", encoding="utf-8") as f:
                        f.write(src)
                start_node = time.time()
                proc = subprocess.Popen(
                    ["node", entry],
                    cwd=td,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                out, err = proc.communicate(timeout=10)
                stdout.append(out.rstrip())
                if err:
                    stderr.append(err.rstrip())
                status = "succeeded" if proc.returncode == 0 else "failed"
                wall_ms = int((time.time() - start) * 1000)
        except FileNotFoundError:
            status = "failed"
            stderr.append("node runtime not installed in container")
        except subprocess.TimeoutExpired:
            status = "failed"
            stderr.append("javascript execution timed out")
        except Exception:
            status = "failed"
            stderr.append(traceback.format_exc())
    else:
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
    wall_ms = int((time.time() - start) * 1000)
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
