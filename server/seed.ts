import { randomUUID as uuid } from "node:crypto";
import { DAY, type Workspace, type Card } from "./model.ts";
export function seed(now: number): Workspace {
  const w: Workspace = {
    revision: 0,
    createdAt: now,
    goal: 10,
    decks: [],
    cards: [],
    notes: [],
    reviews: [],
    study: null,
    receipts: [],
  };
  const sets = [
    {
      title: "The language of algorithms",
      subject: "Computer science",
      color: "coral",
      description:
        "Small ideas that make complex problems feel a little simpler.",
      note: "A way to think about complexity",
      body: "Big O describes how resource use grows with input size. It is a model of growth, not a stopwatch.\n\nAsk three questions:\n• What is the input size?\n• Which operation are we counting?\n• What happens as the input doubles?\n\nA binary search halves a sorted search space on each step. A linear scan inspects elements one at a time. The data structure and its assumptions matter as much as the algorithm.",
      cards: [
        [
          "What does O(log n) mean?",
          "The number of steps grows logarithmically with the input size. Binary search on a sorted collection is a typical example.",
        ],
        [
          "Why does binary search require sorted data?",
          "Ordering lets us safely discard one half of the search interval after each comparison.",
        ],
        [
          "What is a hash collision?",
          "Two distinct keys map to the same bucket. Common resolution strategies include chaining and open addressing.",
        ],
        [
          "When is a queue useful?",
          "When work should be processed in first-in, first-out order, for example breadth-first traversal.",
        ],
        [
          "What is a stable sorting algorithm?",
          "One that preserves the relative order of elements with equal keys.",
        ],
        [
          "What does amortized analysis measure?",
          "The cost per operation averaged across a sequence of operations, including occasional expensive ones.",
        ],
      ],
    },
    {
      title: "Systems, one layer at a time",
      subject: "Computer engineering",
      color: "sage",
      description:
        "From bits and logic gates to the systems built around them.",
      note: "Thinking in layers",
      body: "A computer system can be understood through interfaces: logic gates implement circuits, circuits support an instruction set, and software builds abstractions above it.\n\nA useful habit: identify the inputs, outputs and guarantees at each boundary. A cache improves typical access latency, but correctness still depends on a coherent view of memory.",
      cards: [
        [
          "What is the difference between RAM and persistent storage?",
          "RAM is volatile working memory. Persistent storage retains data across power loss.",
        ],
        [
          "What does a CPU cache do?",
          "Keeps copies of frequently or recently accessed data near the processor to reduce average access time.",
        ],
        [
          "What is a race condition?",
          "Behavior depends on the relative timing of concurrent operations accessing shared state without adequate coordination.",
        ],
        [
          "What does a flip-flop store?",
          "One bit of state, updated according to its inputs and clocking behavior.",
        ],
        [
          "What is an interrupt?",
          "A signal that causes the processor to temporarily transfer control to a handler.",
        ],
      ],
    },
    {
      title: "A practical guide to HTTP",
      subject: "Web development",
      color: "lavender",
      description: "Requests, responses and the contracts that connect them.",
      note: "HTTP is a conversation",
      body: "A request carries a method, target, headers and sometimes a body. A response communicates status, headers and an optional body.\n\nUseful distinctions:\n• Authentication establishes identity.\n• Authorization determines permitted actions.\n• Idempotency means repeating an operation has the same intended effect as performing it once.\n\nTransport success does not guarantee domain correctness. Validate the response contract and the business outcome.",
      cards: [
        [
          "What does HTTP 409 indicate?",
          "A conflict with the current state of the resource, such as a stale edit or conflicting transition.",
        ],
        [
          "What makes an operation idempotent?",
          "Repeating the same operation has the same intended effect as applying it once.",
        ],
        [
          "What is the purpose of a CSRF token?",
          "It helps a server verify that a state-changing request came from a client that obtained a secret tied to the session.",
        ],
        [
          "Why should API inputs be validated on the server?",
          "Clients can be bypassed or modified. Server validation protects the application boundary regardless of the caller.",
        ],
        [
          "What is optimistic concurrency control?",
          "A write includes the version it read. The server rejects the change if the current version differs.",
        ],
      ],
    },
    {
      title: "Patterns in discrete math",
      subject: "Mathematics",
      color: "butter",
      description: "Proofs, sets and the patterns hiding in everyday problems.",
      note: "Proof is a chain of reasons",
      body: "A proof connects assumptions to a conclusion through justified steps. Examples can suggest a statement but do not establish it for every case.\n\nFor induction:\n1. Establish a base case.\n2. State the induction hypothesis.\n3. Prove the next case follows from it.\n\nA counterexample is sufficient to disprove a universal statement.",
      cards: [
        [
          "What is the multiplication principle?",
          "If a process has a choices followed by b choices for each first choice, it has a × b outcomes.",
        ],
        [
          "How many subsets does a set of n elements have?",
          "2ⁿ, because each element can independently be included or excluded.",
        ],
        [
          "What is a counterexample?",
          "A case that satisfies the assumptions of a universal claim but violates its conclusion.",
        ],
        [
          "What does a graph represent?",
          "Vertices represent entities and edges represent relationships between them.",
        ],
      ],
    },
  ];
  sets.forEach((s, j) => {
    const id = uuid();
    w.decks.push({
      id,
      title: s.title,
      subject: s.subject,
      color: s.color as any,
      description: s.description,
      createdAt: now - (j + 1) * DAY,
    });
    w.notes.push({
      id: uuid(),
      deckId: id,
      title: s.note,
      body: s.body,
      updatedAt: now - j * DAY,
    });
    s.cards.forEach(([front, back], i) => {
      const learned = i >= 3;
      const c: Card = {
        id: uuid(),
        deckId: id,
        front,
        back,
        tags: [s.subject.toLowerCase()],
        version: 1,
        createdAt: now - DAY,
        state: learned ? "review" : "new",
        dueAt: learned ? now + (i - 2) * DAY : now - 60000,
        interval: learned ? i : 0,
        ease: 2.5,
        successes: learned ? 2 : 0,
        lapses: 0,
      };
      w.cards.push(c);
    });
  });
  return w;
}
