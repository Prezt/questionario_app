"""
Evaluate question difficulty using a local Ollama model.
Adds a 'difficulty' field (1-10) to each question in public/*.json

Usage:
  python3 scripts/eval_difficulty.py

Options (env vars):
  OLLAMA_HOST   Ollama base URL (default: http://localhost:11434)
  OLLAMA_MODEL  Model to use    (default: qwen2.5:14b-instruct)
  BATCH_SIZE    Questions per API call (default: 10)
  DRY_RUN       Set to '1' to print scores without saving
"""

import json
import glob
import time
import os
import sys
import urllib.request
import urllib.error

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b-instruct")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", 10))
DRY_RUN = os.environ.get("DRY_RUN") == "1"

SYSTEM_PROMPT = """Você é um especialista em avaliação de questões do ENEM.
Sua tarefa é avaliar a dificuldade de cada questão em uma escala de 1 a 10, onde:
- 1-3: Fácil — enunciado direto, habilidade única, alternativas bem distintas
- 4-6: Médio — requer inferência ou relação entre conceitos, alguns distratores fortes
- 7-10: Difícil — múltiplas competências, abstração elevada, presença de negação/exceção,
         distratores muito próximos, texto-base complexo ou interdisciplinaridade

Critérios utilizados:
1. Número de competências/habilidades envolvidas
2. Nível de abstração do enunciado
3. Presença de dupla negação ou estruturas como "Exceto" / "Não é correto afirmar"
4. Proximidade entre as alternativas (distratores fortes)
5. Interdisciplinaridade
6. Extensão e complexidade do texto-base (quando presente)

Responda APENAS com um JSON array de inteiros (1-10), na mesma ordem das questões fornecidas.
Nenhum texto adicional — somente o array.
Exemplo para 3 questões: [4, 7, 2]"""


def ollama_chat(messages: list) -> str:
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0},
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read())
        return body["message"]["content"].strip()


def build_question_text(q: dict, index: int) -> str:
    alts = "\n".join(f"  {k}) {v}" for k, v in q.get("alternatives", {}).items())
    tags = ", ".join(q.get("tags", []))
    return (
        f"Questão {index + 1} (área: {q.get('area', '')}, tags: {tags}):\n"
        f"{q.get('text', '')}\n"
        f"Alternativas:\n{alts}"
    )


def evaluate_batch(questions: list) -> list:
    prompt = "\n\n---\n\n".join(
        build_question_text(q, i) for i, q in enumerate(questions)
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    content = ollama_chat(messages)

    start = content.find("[")
    end = content.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON array in response: {content!r}")

    scores = json.loads(content[start:end])

    if len(scores) != len(questions):
        raise ValueError(f"Expected {len(questions)} scores, got {len(scores)}: {scores}")

    for s in scores:
        if not isinstance(s, int) or not (1 <= s <= 10):
            raise ValueError(f"Invalid score {s!r} — must be integer 1-10")

    return scores


def process_file(filepath: str) -> int:
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    questions = data if isinstance(data, list) else data.get("questions", [])
    changed = 0

    for i in range(0, len(questions), BATCH_SIZE):
        batch = questions[i : i + BATCH_SIZE]
        pending = [q for q in batch if "difficulty" not in q]

        if not pending:
            continue

        try:
            scores = evaluate_batch(pending)
        except Exception as e:
            print(f"  [ERROR] batch {i}–{i + len(batch)}: {e}", file=sys.stderr)
            time.sleep(2)
            continue

        j = 0
        for q in batch:
            if "difficulty" not in q:
                score = scores[j]
                if DRY_RUN:
                    print(f"  Q#{q.get('number')} → {score}")
                else:
                    q["difficulty"] = score
                changed += 1
                j += 1

        # Small pause between batches to avoid overwhelming Ollama
        time.sleep(0.2)

    if not DRY_RUN:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return changed


if __name__ == "__main__":
    # Sanity check: make sure Ollama is reachable
    try:
        req = urllib.request.Request(f"{OLLAMA_HOST}/api/tags")
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f"Error: cannot reach Ollama at {OLLAMA_HOST}: {e}", file=sys.stderr)
        sys.exit(1)

    files = sorted(
        f
        for f in glob.glob("public/*.json")
        if "manifest" not in f and "contexts" not in f
    )

    if not files:
        print("No question files found in public/", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN — no files will be modified" if DRY_RUN else "writing results to public/*.json"
    print(f"eval_difficulty.py — {mode}")
    print(f"Model: {OLLAMA_MODEL}  |  Files: {len(files)}  |  Batch size: {BATCH_SIZE}\n")

    total = 0
    for filepath in files:
        print(f"Processing {filepath}...")
        changed = process_file(filepath)
        total += changed
        print(f"  {changed} questions evaluated")

    print(f"\nDone. {total} total questions evaluated.")
