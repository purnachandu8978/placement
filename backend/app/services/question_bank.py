"""Real multi-skill question bank and strict 5Q/10Q assessment builder."""

from typing import Any, Dict, List


_SKILL_MCQS: Dict[str, List[Dict[str, Any]]] = {
    "Python": [
        {
            "id": "mcq-py-1",
            "question": "In Python asyncio, what happens when a synchronous blocking call (e.g., time.sleep) executes inside an async coroutine?",
            "options": [
                "Python spawns a separate OS thread automatically",
                "It blocks the single event loop thread and stalls all concurrent tasks",
                "Asyncio pauses only that coroutine without delaying others",
                "The GIL releases immediately to let other coroutines progress",
            ],
            "correct_answer": 1,
            "explanation": "Synchronous blocking calls block the event loop thread; blocking I/O must use asyncio-native APIs or asyncio.to_thread.",
        },
        {
            "id": "mcq-py-2",
            "question": "Why are mutable default arguments like def f(items=[]) discouraged in Python?",
            "options": [
                "Lists cannot be passed to functions cleanly",
                "The default object is evaluated once at function definition and shared across calls",
                "It causes a SyntaxError in Python 3.12+",
                "Python copies the default list deeply on every call, hurting performance",
            ],
            "correct_answer": 1,
            "explanation": "Default parameter values are bound once when the def statement executes, causing mutations to persist across calls.",
        },
        {
            "id": "mcq-py-3",
            "question": "What does Python's contextlib / with-statement __exit__ guarantee?",
            "options": [
                "Resource cleanup runs deterministically even if an exception occurs inside the block",
                "Code inside the block executes asynchronously in a worker pool",
                "Memory allocation is pinned outside garbage collection",
                "Exceptions are silently ignored by default",
            ],
            "correct_answer": 0,
            "explanation": "Context managers ensure deterministic teardown (__exit__) when exiting normal flow or handling exceptions.",
        },
        {
            "id": "mcq-py-4",
            "question": "What is the time complexity of looking up a key in a Python dict on average?",
            "options": ["O(n)", "O(log n)", "O(1)", "O(n log n)"],
            "correct_answer": 2,
            "explanation": "Python dicts use open-addressing hash tables providing amortized O(1) lookup.",
        },
        {
            "id": "mcq-py-5",
            "question": "When is a Python generator preferred over returning a materialized list?",
            "options": [
                "When random O(1) indexing into the collection is required",
                "When streaming large sequences lazily with O(1) memory footprint",
                "When the caller needs len() on the result immediately",
                "When sorting elements in-place repeatedly",
            ],
            "correct_answer": 1,
            "explanation": "Generators yield items lazily one by one without buffering the full dataset in memory.",
        },
        {
            "id": "mcq-py-6",
            "question": "What is the purpose of Pydantic BaseModel validation in FastAPI endpoints?",
            "options": [
                "Runtime type validation, coercion, and structured schema serialization",
                "Compiling Python bytecode into machine code",
                "Replacing database primary keys automatically",
                "Bypassing HTTP CORS headers",
            ],
            "correct_answer": 0,
            "explanation": "Pydantic validates incoming payloads at runtime and exports OpenAPI schemas automatically.",
        },
    ],
    "React": [
        {
            "id": "mcq-react-1",
            "question": "What triggers a component re-render in React's reconciliation cycle?",
            "options": [
                "State updates, parent re-renders, or context value changes",
                "Mutating a plain local JS variable inside the render function",
                "Changing a CSS hover state",
                "Updating a useRef .current property",
            ],
            "correct_answer": 0,
            "explanation": "Updating a useRef does not trigger re-render; state, props/parent, and subscribed context changes drive renders.",
        },
        {
            "id": "mcq-react-2",
            "question": "Why must list items use stable, unique keys rather than unstable random IDs during render?",
            "options": [
                "Random keys break CSS Flexbox ordering",
                "Stable keys let React Fiber preserve component state and reuse existing DOM nodes",
                "Keys are sent to the backend database automatically",
                "Without random keys, TypeScript refuses to compile JSX",
            ],
            "correct_answer": 1,
            "explanation": "Stable keys let React match elements across renders instead of unmounting and remounting subtrees.",
        },
        {
            "id": "mcq-react-3",
            "question": "How does a useEffect cleanup function behave when dependencies change?",
            "options": [
                "It runs only once when the browser tab closes",
                "It runs prior to executing the next effect and upon component unmount",
                "It executes before the first render completes",
                "It only runs when an uncaught error occurs",
            ],
            "correct_answer": 1,
            "explanation": "React invokes the previous effect's cleanup before running the updated effect or unmounting.",
        },
        {
            "id": "mcq-react-4",
            "question": "When is useTransition helpful in interactive React UIs?",
            "options": [
                "For synchronous DOM focus management",
                "Marking heavy non-urgent UI updates so urgent user typing remains responsive",
                "Replacing try/catch around async fetch calls",
                "Pinning CSS animations to 60fps",
            ],
            "correct_answer": 1,
            "explanation": "Transitions keep high-priority input state responsive while rendering expensive filtered views.",
        },
        {
            "id": "mcq-react-5",
            "question": "What distinguishes useLayoutEffect from useEffect?",
            "options": [
                "useLayoutEffect runs synchronously after DOM mutations before browser paint",
                "useLayoutEffect runs inside a Web Worker",
                "useEffect blocks browser painting until promises settle",
                "They execute at the exact same timing",
            ],
            "correct_answer": 0,
            "explanation": "useLayoutEffect lets components measure layout synchronously before visual paint, preventing flicker.",
        },
        {
            "id": "mcq-react-6",
            "question": "What is the primary architectural benefit of code-splitting routes with React.lazy + Suspense?",
            "options": [
                "Eliminates backend API authentication checks",
                "Reduces initial JavaScript bundle size by loading page chunks on demand",
                "Compiles TypeScript at runtime inside the browser",
                "Stores all component state in IndexedDB",
            ],
            "correct_answer": 1,
            "explanation": "Route-level dynamic imports defer downloading heavy page code until needed.",
        },
    ],
    "TypeScript": [
        {
            "id": "mcq-ts-1",
            "question": "How does the unknown type differ from any in TypeScript?",
            "options": [
                "unknown requires type narrowing before operations, whereas any disables type checking",
                "any is stricter than unknown at compile time",
                "unknown is stripped at runtime while any throws errors",
                "They behave identically under strict mode",
            ],
            "correct_answer": 0,
            "explanation": "unknown preserves type safety by forcing callers to narrow the type before accessing properties or calling methods.",
        },
        {
            "id": "mcq-ts-2",
            "question": "What does a discriminated union enable in TypeScript?",
            "options": [
                "Automatic database migrations",
                "Exhaustive type narrowing via a shared literal tag field",
                "Runtime reflection of private class properties",
                "Converting interfaces into JSON strings automatically",
            ],
            "correct_answer": 1,
            "explanation": "Checking a literal discriminant (e.g., kind or status) narrows the union branch statically.",
        },
        {
            "id": "mcq-ts-3",
            "question": "What is the effect of the Partial<T> utility type?",
            "options": [
                "Makes all top-level properties of T required",
                "Makes all top-level properties of T optional",
                "Removes all methods from T",
                "Freezes all nested objects at runtime",
            ],
            "correct_answer": 1,
            "explanation": "Partial<T> maps every key in T to optional (?:), ideal for PATCH/update payloads.",
        },
        {
            "id": "mcq-ts-4",
            "question": "Why use as const assertions on configuration objects or arrays?",
            "options": [
                "Infers deep readonly literal types instead of widened string/number types",
                "Forces garbage collection immediately",
                "Makes variables globally mutable across modules",
                "Skips compiling that file with tsc",
            ],
            "correct_answer": 0,
            "explanation": "as const preserves exact literal types and marks properties readonly.",
        },
        {
            "id": "mcq-ts-5",
            "question": "What is a type predicate function (e.g., param is User)?",
            "options": [
                "A runtime assert statement only for Node.js",
                "A custom type guard informing TypeScript of the narrowed type when returning true",
                "A decorator used solely for unit tests",
                "An alias for typeof null",
            ],
            "correct_answer": 1,
            "explanation": "Type predicates let custom validation helpers narrow unknown/union values cleanly.",
        },
        {
            "id": "mcq-ts-6",
            "question": "What does Omit<T, K> produce?",
            "options": [
                "A type picking only keys K from T",
                "A type constructed from T with keys K excluded",
                "A union of keys in T",
                "An intersection of T and K",
            ],
            "correct_answer": 1,
            "explanation": "Omit<T, K> removes specified keys K from object type T.",
        },
    ],
    "MongoDB": [
        {
            "id": "mcq-mdb-1",
            "question": "Why are compound indexes ordered carefully in MongoDB (Equality -> Sort -> Range)?",
            "options": [
                "MongoDB only queries string fields otherwise",
                "The ESR rule maximizes index selectivity and avoids in-memory sorts",
                "Indexes must match alphabetical field order",
                "Otherwise documents are deleted during compaction",
            ],
            "correct_answer": 1,
            "explanation": "Following Equality-Sort-Range lets MongoDB resolve filters and ordering in a single B-Tree scan.",
        },
        {
            "id": "mcq-mdb-2",
            "question": "When does Motor (async MongoDB Python driver) outperform synchronous PyMongo in FastAPI?",
            "options": [
                "When using a single blocking thread",
                "When non-blocking I/O lets an async event loop serve thousands of concurrent DB calls cleanly",
                "Because Motor disables TLS encryption",
                "Because Motor stores all collections inside browser cookies",
            ],
            "correct_answer": 1,
            "explanation": "Motor integrates cleanly with asyncio so FastAPI coroutines do not block the event loop waiting on I/O.",
        },
        {
            "id": "mcq-mdb-3",
            "question": "What is the purpose of $setOnInsert inside an update_one(..., upsert=True) call?",
            "options": [
                "Modifies fields on every matched update",
                "Applies fields only when a brand-new document is inserted during upsert",
                "Drops indexes if the document already exists",
                "Forces a collection scan",
            ],
            "correct_answer": 1,
            "explanation": "$setOnInsert sets initialization fields only on insert while keeping existing records untouched.",
        },
        {
            "id": "mcq-mdb-4",
            "question": "Why set unique indexes directly at the MongoDB collection level rather than relying solely on app checks?",
            "options": [
                "App-level checks suffer from TOCTOU race conditions under concurrent requests",
                "MongoDB forbids queries without unique indexes",
                "App code cannot compare strings accurately",
                "Unique indexes encrypt document values",
            ],
            "correct_answer": 0,
            "explanation": "Database-enforced unique constraints prevent duplicate keys across concurrent writers atomically.",
        },
        {
            "id": "mcq-mdb-5",
            "question": "Which aggregation stage filters documents early in a pipeline to reduce memory usage?",
            "options": ["$group", "$match", "$unwind", "$sort"],
            "correct_answer": 1,
            "explanation": "Placing $match first leverages collection indexes and shrinks the working set before expensive stages.",
        },
        {
            "id": "mcq-mdb-6",
            "question": "What write concern guarantees data is persisted across a replica set majority before acknowledging?",
            "options": ["w=0", "w=1", "w='majority'", "j=False"],
            "correct_answer": 2,
            "explanation": "w='majority' ensures writes survive primary failover on replicated MongoDB clusters.",
        },
    ],
    "Docker": [
        {
            "id": "mcq-dock-1",
            "question": "Why are multi-stage Dockerfiles standard for production deployments?",
            "options": [
                "They allow containers to bypass Linux namespaces",
                "They separate build toolchains from the slim runtime stage, slashing image size and attack surface",
                "They disable layer caching automatically",
                "They run multiple kernels inside one container",
            ],
            "correct_answer": 1,
            "explanation": "Copying only compiled artifacts/wheels into a minimal final base image keeps production images lean and secure.",
        },
        {
            "id": "mcq-dock-2",
            "question": "Why should COPY requirements.txt && RUN pip install happen before COPY . . in a Dockerfile?",
            "options": [
                "Source code changes don't invalidate the cached dependency installation layer",
                "Docker prohibits copying application code before text files",
                "pip cannot run after source directories exist",
                "It compresses network packets during runtime",
            ],
            "correct_answer": 0,
            "explanation": "Ordering stable layers first maximizes Docker build cache hits when application code edits occur.",
        },
        {
            "id": "mcq-dock-3",
            "question": "Why run container processes as a non-root USER inside production images?",
            "options": [
                "Root user breaks HTTP health checks",
                "Limits blast radius if an application vulnerability leads to container escape or file tampering",
                "Non-root containers get higher CPU shares",
                "Required by Docker Hub to pull images",
            ],
            "correct_answer": 1,
            "explanation": "Least-privilege non-root execution reduces privilege escalation risk on the container host.",
        },
        {
            "id": "mcq-dock-4",
            "question": "What does .dockerignore prevent?",
            "options": [
                "Sending huge directories like node_modules or .git and secret .env files into the build context",
                "Starting background daemons",
                "Binding ports on localhost",
                "Validating TLS certificates",
            ],
            "correct_answer": 0,
            "explanation": ".dockerignore keeps builds fast and stops local secrets/caches from leaking into layers.",
        },
        {
            "id": "mcq-dock-5",
            "question": "What is the key difference between CMD and ENTRYPOINT when overridden at docker run?",
            "options": [
                "CMD provides default arguments/command easily overridden; ENTRYPOINT defines the fixed executable",
                "ENTRYPOINT is ignored in Linux containers",
                "CMD runs only during docker build",
                "They are identical aliases",
            ],
            "correct_answer": 0,
            "explanation": "Arguments appended to docker run override CMD and are passed cleanly to ENTRYPOINT.",
        },
        {
            "id": "mcq-dock-6",
            "question": "Why prefer exec-form CMD [\"python\", \"app.py\"] over shell-form CMD python app.py?",
            "options": [
                "Exec form runs the app as PID 1 so SIGTERM/SIGINT signals reach it cleanly for graceful shutdown",
                "Shell form fails to expand environment variables",
                "Exec form bypasses DNS resolution",
                "Shell form doubles container disk quota",
            ],
            "correct_answer": 0,
            "explanation": "Shell-form wraps the process in /bin/sh -c, which can swallow SIGTERM during container stop.",
        },
    ],
}


def _generic_mcqs(skill: str) -> List[Dict[str, Any]]:
    slug = skill.lower().replace(" ", "-").replace("+", "plus").replace(".", "")
    return [
        {
            "id": f"mcq-{slug}-1",
            "question": f"In production {skill} engineering, why are idempotent operations critical when handling retries?",
            "options": [
                "Retries without idempotency can duplicate side effects or corrupt state",
                "Idempotency disables authentication tokens",
                "Retries execute faster only when state mutates randomly",
                "Idempotent code ignores network timeouts",
            ],
            "correct_answer": 0,
            "explanation": f"In reliable {skill} services, idempotent handlers ensure network retries produce consistent state without duplicates.",
        },
        {
            "id": f"mcq-{slug}-2",
            "question": f"Which observability signal best reveals tail-latency bottlenecks in a {skill} workload?",
            "options": [
                "P95 / P99 latency percentiles combined with distributed trace spans",
                "Arithmetic mean latency averaged across 24 hours",
                "Total disk image size alone",
                "Count of static comments in source code",
            ],
            "correct_answer": 0,
            "explanation": "Averages mask outliers; P95/P99 latency metrics expose slow paths affecting real users.",
        },
        {
            "id": f"mcq-{slug}-3",
            "question": f"When designing modular {skill} components, why enforce explicit boundary validation?",
            "options": [
                "Fails fast on malformed inputs, prevents injection flaws, and keeps internal invariants clean",
                "Avoids writing any automated tests",
                "Forces synchronous single-threaded execution everywhere",
                "Eliminates version control",
            ],
            "correct_answer": 0,
            "explanation": "Strict input validation at boundaries catches invalid payloads early and hardens security.",
        },
        {
            "id": f"mcq-{slug}-4",
            "question": f"What happens when {skill} workloads lack bounded timeouts and backpressure?",
            "options": [
                "Cascading exhaustion of threads, sockets, and memory under downstream slowdowns",
                "Automatic zero-latency caching",
                "Linear horizontal scaling with zero configuration",
                "Database indexes rebuild silently",
            ],
            "correct_answer": 0,
            "explanation": "Bounded timeouts and backpressure prevent upstream slowdowns from exhausting all server capacity.",
        },
        {
            "id": f"mcq-{slug}-5",
            "question": f"Which testing strategy verifies {skill} behavior against real contract invariants?",
            "options": [
                "Testing edge cases, failure paths, and boundary contracts deterministically",
                "Testing only happy-path defaults with assertions disabled",
                "Skipping CI checks before deployment",
                "Checking variable names with regex only",
            ],
            "correct_answer": 0,
            "explanation": "Deterministic tests across edge cases and failure modes catch regressions before production.",
        },
        {
            "id": f"mcq-{slug}-6",
            "question": f"Why decouple configuration secrets from {skill} application code?",
            "options": [
                "Prevents credential leaks in repositories and enables per-environment rotation",
                "Hardcoding secrets makes compilation faster",
                "Environment variables encrypt network traffic automatically",
                "Secrets must be stored inside public frontend bundles",
            ],
            "correct_answer": 0,
            "explanation": "Keeping secrets in environment/secret stores stops VCS leaks and simplifies key rotation.",
        },
    ]


def _coding_prompts(skill: str) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    slug = skill.lower().replace(" ", "-").replace("+", "plus").replace(".", "")
    langs = ["python", "javascript", "java", "cpp"]
    simple = [
        {
            "id": f"code-{slug}-simple-1",
            "type": "simple_coding",
            "difficulty": "medium",
            "title": f"{skill}: Sliding Window Rate Limiter",
            "problem_statement": (
                f"Implement a standard I/O sliding-window rate limiter validator relevant to {skill} services. "
                "A request arriving at timestamp t (ms) is allowed if fewer than `limit` previously ACCEPTED "
                "requests fall within `[t - window_ms + 1, t]`."
            ),
            "input_format": (
                "Line 1: two space-separated integers `limit` and `window_ms`.\n"
                "Line 2: integer `N` (number of incoming timestamps, 1 <= N <= 10^5).\n"
                "Line 3: `N` space-separated non-decreasing integer timestamps in milliseconds."
            ),
            "output_format": "Print `N` space-separated lowercase booleans (`true` or `false`) on a single line.",
            "constraints": [
                "1 <= limit <= 10^4",
                "1 <= window_ms <= 10^9",
                "1 <= N <= 10^5",
                "Only ACCEPTED requests occupy capacity in the sliding window.",
            ],
            "supported_languages": langs,
            "time_limit_ms": 2000,
            "memory_limit_kb": 262144,
            "approval_status": "approved",
            "starter_code": {
                "python": (
                    "import sys\nfrom collections import deque\n\n"
                    "def solve():\n"
                    "    data = sys.stdin.read().split()\n"
                    "    if not data:\n"
                    "        return\n"
                    "    limit, window_ms = int(data[0]), int(data[1])\n"
                    "    n = int(data[2])\n"
                    "    timestamps = [int(x) for x in data[3:3 + n]]\n"
                    "    # TODO: print space-separated 'true' or 'false'\n\n"
                    "if __name__ == '__main__':\n"
                    "    solve()\n"
                ),
                "javascript": (
                    "const fs = require('fs');\n"
                    "const tokens = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);\n"
                    "if (tokens.length >= 3 && tokens[0]) {\n"
                    "  const limit = Number(tokens[0]);\n"
                    "  const windowMs = Number(tokens[1]);\n"
                    "  const n = Number(tokens[2]);\n"
                    "  const timestamps = tokens.slice(3, 3 + n).map(Number);\n"
                    "  // TODO: compute sliding window decisions and print space-separated true/false\n"
                    "}\n"
                ),
                "java": (
                    "import java.io.*;\nimport java.util.*;\n\n"
                    "public class Main {\n"
                    "    public static void main(String[] args) throws Exception {\n"
                    "        Scanner sc = new Scanner(System.in);\n"
                    "        if (!sc.hasNextLong()) return;\n"
                    "        long limit = sc.nextLong(), windowMs = sc.nextLong();\n"
                    "        int n = sc.nextInt();\n"
                    "        long[] ts = new long[n];\n"
                    "        for (int i = 0; i < n; i++) ts[i] = sc.nextLong();\n"
                    "        // TODO: print space-separated true/false\n"
                    "    }\n"
                    "}\n"
                ),
                "cpp": (
                    "#include <bits/stdc++.h>\nusing namespace std;\n\n"
                    "int main() {\n"
                    "    ios::sync_with_stdio(false);\n"
                    "    cin.tie(nullptr);\n"
                    "    long long limit, windowMs;\n"
                    "    int n;\n"
                    "    if (!(cin >> limit >> windowMs >> n)) return 0;\n"
                    "    vector<long long> ts(n);\n"
                    "    for (int i = 0; i < n; ++i) cin >> ts[i];\n"
                    "    // TODO: print space-separated true/false\n"
                    "    return 0;\n"
                    "}\n"
                ),
            },
            "points": 20,
            "test_cases": [
                {"id": "tc-rl-1", "label": "Sample 1", "input": "2 1000\n3\n0 200 500\n", "expected": "true true false", "is_hidden": False, "weight": 1.0},
                {"id": "tc-rl-2", "label": "Sample 2", "input": "2 1000\n4\n0 200 1000 1200\n", "expected": "true true true true", "is_hidden": False, "weight": 1.0},
                {"id": "tc-rl-3", "label": "Hidden Rejected Excluded", "input": "2 1000\n5\n0 100 200 1000 1001\n", "expected": "true true false true false", "is_hidden": True, "weight": 1.0},
                {"id": "tc-rl-4", "label": "Hidden Tight Window", "input": "1 500\n4\n10 509 510 1009\n", "expected": "true false true false", "is_hidden": True, "weight": 1.0},
                {"id": "tc-rl-5", "label": "Hidden Single Request", "input": "1 100\n1\n42\n", "expected": "true", "is_hidden": True, "weight": 1.0},
            ],
        },
        {
            "id": f"code-{slug}-simple-2",
            "type": "simple_coding",
            "difficulty": "easy",
            "title": f"{skill}: Peak Telemetry Window Sum",
            "problem_statement": (
                f"Given `N` latency/metric readings recorded by a {skill} monitor and window width `K`, "
                "compute the maximum sum over any contiguous subarray of length exactly `K`."
            ),
            "input_format": (
                "Line 1: two integers `N` and `K` (1 <= K <= N <= 10^5).\n"
                "Line 2: `N` space-separated integers (may be negative)."
            ),
            "output_format": "Print a single integer representing the maximum contiguous subarray sum of length K.",
            "constraints": [
                "1 <= K <= N <= 10^5",
                "-10^9 <= a[i] <= 10^9",
                "Expected time complexity: O(N)",
            ],
            "supported_languages": langs,
            "time_limit_ms": 2000,
            "memory_limit_kb": 262144,
            "approval_status": "approved",
            "starter_code": {
                "python": (
                    "import sys\n\n"
                    "def solve():\n"
                    "    data = sys.stdin.read().split()\n"
                    "    if not data:\n"
                    "        return\n"
                    "    n, k = int(data[0]), int(data[1])\n"
                    "    arr = [int(x) for x in data[2:2 + n]]\n"
                    "    # TODO: compute maximum sum of contiguous window size k\n\n"
                    "if __name__ == '__main__':\n"
                    "    solve()\n"
                ),
                "javascript": (
                    "const fs = require('fs');\n"
                    "const tokens = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);\n"
                    "if (tokens.length >= 2 && tokens[0]) {\n"
                    "  const n = Number(tokens[0]);\n"
                    "  const k = Number(tokens[1]);\n"
                    "  const arr = tokens.slice(2, 2 + n).map(Number);\n"
                    "  // TODO: print maximum sum of subarray of size k\n"
                    "}\n"
                ),
                "java": (
                    "import java.io.*;\nimport java.util.*;\n\n"
                    "public class Main {\n"
                    "    public static void main(String[] args) {\n"
                    "        Scanner sc = new Scanner(System.in);\n"
                    "        if (!sc.hasNextInt()) return;\n"
                    "        int n = sc.nextInt(), k = sc.nextInt();\n"
                    "        long[] arr = new long[n];\n"
                    "        for (int i = 0; i < n; i++) arr[i] = sc.nextLong();\n"
                    "        // TODO: print maximum subarray sum of length k\n"
                    "    }\n"
                    "}\n"
                ),
                "cpp": (
                    "#include <bits/stdc++.h>\nusing namespace std;\n\n"
                    "int main() {\n"
                    "    ios::sync_with_stdio(false);\n"
                    "    cin.tie(nullptr);\n"
                    "    int n, k;\n"
                    "    if (!(cin >> n >> k)) return 0;\n"
                    "    vector<long long> arr(n);\n"
                    "    for (int i = 0; i < n; ++i) cin >> arr[i];\n"
                    "    // TODO: print maximum subarray sum of length k\n"
                    "    return 0;\n"
                    "}\n"
                ),
            },
            "points": 20,
            "test_cases": [
                {"id": "tc-ws-1", "label": "Sample 1", "input": "5 3\n2 1 5 1 3\n", "expected": "9", "is_hidden": False, "weight": 1.0},
                {"id": "tc-ws-2", "label": "Sample 2", "input": "4 2\n-1 -2 -3 -4\n", "expected": "-3", "is_hidden": False, "weight": 1.0},
                {"id": "tc-ws-3", "label": "Hidden Tail Peak", "input": "6 2\n2 3 4 1 5 6\n", "expected": "11", "is_hidden": True, "weight": 1.0},
                {"id": "tc-ws-4", "label": "Hidden Single Element", "input": "1 1\n42\n", "expected": "42", "is_hidden": True, "weight": 1.0},
                {"id": "tc-ws-5", "label": "Hidden Full Window", "input": "5 5\n1 -1 2 -2 5\n", "expected": "5", "is_hidden": True, "weight": 1.0},
            ],
        },
    ]
    hard = [
        {
            "id": f"code-{slug}-hard-1",
            "type": "hard_coding",
            "difficulty": "hard",
            "title": f"{skill}: O(1) Capacity-Bounded LRU Cache",
            "problem_statement": (
                f"Design and run a capacity-bounded LRU Cache tailored for high-throughput {skill} backends. "
                "Process a sequence of `GET k` and `PUT k v` operations. Both `GET` (when key exists) and `PUT` "
                "mark `k` as most recently used. When full, `PUT` of a new key evicts the least recently used key."
            ),
            "input_format": (
                "Line 1: two integers `capacity` and `Q` (number of operations).\n"
                "Next `Q` lines: either `GET key` or `PUT key value` (integer keys & values)."
            ),
            "output_format": "For each `GET` operation, print the cached integer value or `-1` on its own line.",
            "constraints": [
                "1 <= capacity <= 10^4",
                "1 <= Q <= 10^5",
                "Expected time complexity: O(1) per GET/PUT",
            ],
            "supported_languages": langs,
            "time_limit_ms": 2000,
            "memory_limit_kb": 262144,
            "approval_status": "approved",
            "starter_code": {
                "python": (
                    "import sys\nfrom collections import OrderedDict\n\n"
                    "def solve():\n"
                    "    lines = [ln.strip() for ln in sys.stdin if ln.strip()]\n"
                    "    if not lines:\n"
                    "        return\n"
                    "    cap, q = map(int, lines[0].split())\n"
                    "    # TODO: simulate LRU cache operations and print GET outputs\n\n"
                    "if __name__ == '__main__':\n"
                    "    solve()\n"
                ),
                "javascript": (
                    "const fs = require('fs');\n"
                    "const lines = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/).filter(Boolean);\n"
                    "if (lines.length) {\n"
                    "  const [cap, q] = lines[0].trim().split(/\\s+/).map(Number);\n"
                    "  // TODO: simulate LRU cache and log GET outputs\n"
                    "}\n"
                ),
                "java": (
                    "import java.io.*;\nimport java.util.*;\n\n"
                    "public class Main {\n"
                    "    public static void main(String[] args) throws Exception {\n"
                    "        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n"
                    "        String first = br.readLine();\n"
                    "        if (first == null) return;\n"
                    "        StringTokenizer st = new StringTokenizer(first);\n"
                    "        int cap = Integer.parseInt(st.nextToken());\n"
                    "        int q = Integer.parseInt(st.nextToken());\n"
                    "        // TODO: process Q operations and print GET results\n"
                    "    }\n"
                    "}\n"
                ),
                "cpp": (
                    "#include <bits/stdc++.h>\nusing namespace std;\n\n"
                    "int main() {\n"
                    "    ios::sync_with_stdio(false);\n"
                    "    cin.tie(nullptr);\n"
                    "    int cap, q;\n"
                    "    if (!(cin >> cap >> q)) return 0;\n"
                    "    // TODO: process Q operations and print GET results\n"
                    "    return 0;\n"
                    "}\n"
                ),
            },
            "points": 30,
            "test_cases": [
                {
                    "id": "tc-lru-1",
                    "label": "Sample 1",
                    "input": "2 6\nPUT 1 10\nPUT 2 20\nGET 1\nPUT 3 30\nGET 2\nGET 3\n",
                    "expected": "10\n-1\n30",
                    "is_hidden": False,
                    "weight": 1.0,
                },
                {
                    "id": "tc-lru-2",
                    "label": "Sample 2",
                    "input": "1 4\nPUT 5 50\nPUT 6 60\nGET 5\nGET 6\n",
                    "expected": "-1\n60",
                    "is_hidden": False,
                    "weight": 1.0,
                },
                {
                    "id": "tc-lru-3",
                    "label": "Hidden Update Promotes",
                    "input": "2 7\nPUT 1 1\nPUT 2 2\nPUT 1 100\nPUT 3 3\nGET 2\nGET 1\nGET 3\n",
                    "expected": "-1\n100\n3",
                    "is_hidden": True,
                    "weight": 1.0,
                },
                {
                    "id": "tc-lru-4",
                    "label": "Hidden Get Promotes",
                    "input": "2 6\nPUT 1 10\nPUT 2 20\nGET 1\nPUT 3 30\nGET 1\nGET 2\n",
                    "expected": "10\n10\n-1",
                    "is_hidden": True,
                    "weight": 1.0,
                },
                {
                    "id": "tc-lru-5",
                    "label": "Hidden Missing And Cap 3",
                    "input": "3 8\nGET 9\nPUT 1 5\nPUT 2 6\nPUT 3 7\nGET 2\nPUT 4 8\nGET 1\nGET 3\n",
                    "expected": "-1\n6\n-1\n7",
                    "is_hidden": True,
                    "weight": 1.0,
                },
            ],
        },
        {
            "id": f"code-{slug}-hard-2",
            "type": "hard_coding",
            "difficulty": "hard",
            "title": f"{skill}: Merge Overlapping Execution Intervals",
            "problem_statement": (
                f"A {skill} trace collector records `N` active span intervals `[start, end]`. "
                "Merge all overlapping or touching intervals (`a.end >= b.start`) and print the consolidated "
                "disjoint intervals sorted in ascending order of start time."
            ),
            "input_format": (
                "Line 1: integer `N` (1 <= N <= 10^5).\n"
                "Next `N` lines: two integers `start end`."
            ),
            "output_format": "Print each merged interval `start end` on a separate line sorted ascending.",
            "constraints": [
                "1 <= N <= 10^5",
                "0 <= start <= end <= 10^9",
                "Touching endpoints [1, 4] and [4, 5] merge into [1, 5].",
            ],
            "supported_languages": langs,
            "time_limit_ms": 2000,
            "memory_limit_kb": 262144,
            "approval_status": "approved",
            "starter_code": {
                "python": (
                    "import sys\n\n"
                    "def solve():\n"
                    "    data = sys.stdin.read().split()\n"
                    "    if not data:\n"
                    "        return\n"
                    "    n = int(data[0])\n"
                    "    intervals = [(int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)]\n"
                    "    # TODO: merge overlapping intervals and print start end per line\n\n"
                    "if __name__ == '__main__':\n"
                    "    solve()\n"
                ),
                "javascript": (
                    "const fs = require('fs');\n"
                    "const tokens = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);\n"
                    "if (tokens.length && tokens[0]) {\n"
                    "  const n = Number(tokens[0]);\n"
                    "  const intervals = [];\n"
                    "  for (let i = 0; i < n; i++) intervals.push([Number(tokens[1 + 2 * i]), Number(tokens[2 + 2 * i])]);\n"
                    "  // TODO: merge overlapping intervals and log 'start end' lines\n"
                    "}\n"
                ),
                "java": (
                    "import java.io.*;\nimport java.util.*;\n\n"
                    "public class Main {\n"
                    "    public static void main(String[] args) {\n"
                    "        Scanner sc = new Scanner(System.in);\n"
                    "        if (!sc.hasNextInt()) return;\n"
                    "        int n = sc.nextInt();\n"
                    "        long[][] iv = new long[n][2];\n"
                    "        for (int i = 0; i < n; i++) { iv[i][0] = sc.nextLong(); iv[i][1] = sc.nextLong(); }\n"
                    "        // TODO: merge intervals and print 'start end' lines\n"
                    "    }\n"
                    "}\n"
                ),
                "cpp": (
                    "#include <bits/stdc++.h>\nusing namespace std;\n\n"
                    "int main() {\n"
                    "    ios::sync_with_stdio(false);\n"
                    "    cin.tie(nullptr);\n"
                    "    int n;\n"
                    "    if (!(cin >> n)) return 0;\n"
                    "    vector<pair<long long, long long>> iv(n);\n"
                    "    for (int i = 0; i < n; ++i) cin >> iv[i].first >> iv[i].second;\n"
                    "    // TODO: merge intervals and print 'start end' lines\n"
                    "    return 0;\n"
                    "}\n"
                ),
            },
            "points": 30,
            "test_cases": [
                {"id": "tc-mi-1", "label": "Sample 1", "input": "4\n1 3\n2 6\n8 10\n15 18\n", "expected": "1 6\n8 10\n15 18", "is_hidden": False, "weight": 1.0},
                {"id": "tc-mi-2", "label": "Sample 2", "input": "2\n1 4\n4 5\n", "expected": "1 5", "is_hidden": False, "weight": 1.0},
                {"id": "tc-mi-3", "label": "Hidden Nested Unsorted", "input": "4\n6 8\n1 9\n2 4\n4 7\n", "expected": "1 9", "is_hidden": True, "weight": 1.0},
                {"id": "tc-mi-4", "label": "Hidden Single Span", "input": "1\n5 5\n", "expected": "5 5", "is_hidden": True, "weight": 1.0},
                {"id": "tc-mi-5", "label": "Hidden Disjoint Unsorted", "input": "3\n10 12\n1 3\n5 7\n", "expected": "1 3\n5 7\n10 12", "is_hidden": True, "weight": 1.0},
            ],
        },
    ]
    return simple, hard


def build_assessment_for_skill(skill_name: str, category: str = "Technical Skills", size: int = 5) -> Dict[str, Any]:
    """Builds a strict 5Q (3 MCQ + 1 Simple + 1 Hard) or 10Q (6 MCQ + 2 Simple + 2 Hard) assessment."""
    clean_skill = skill_name.strip() or "Software Engineering"
    slug = clean_skill.lower().replace(" ", "-").replace("/", "-")

    pool = _SKILL_MCQS.get(clean_skill)
    if not pool:
        for k, v in _SKILL_MCQS.items():
            if k.lower() == clean_skill.lower():
                pool = v
                break
    mcqs = [dict(q, type="mcq", points=10) for q in (pool or _generic_mcqs(clean_skill))]
    simple_pool, hard_pool = _coding_prompts(clean_skill)

    if size == 10:
        questions = mcqs[:6] + simple_pool[:2] + hard_pool[:2]
        dist = {"mcq": 6, "simple_coding": 2, "hard_coding": 2}
        duration = 60
        title = f"{clean_skill} Enterprise Architecture (10-Question Comprehensive)"
    else:
        size = 5
        questions = mcqs[:3] + [simple_pool[0]] + [hard_pool[0]]
        dist = {"mcq": 3, "simple_coding": 1, "hard_coding": 1}
        duration = 30
        title = f"{clean_skill} Technical Competency (5-Question Quick)"

    assessment_id = f"test-{slug}-{size}"
    return {
        "id": assessment_id,
        "skill_id": slug,
        "skill_name": clean_skill,
        "category": category,
        "title": title,
        "assessment_size": size,
        "duration_minutes": duration,
        "pass_score_percentage": 75,
        "question_distribution": dist,
        "questions": questions,
        "question_ids": [q["id"] for q in questions],
        "published_status": "published",
    }
