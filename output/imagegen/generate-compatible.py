"""Save the image service's URL or Base64 responses without discarding originals.

Run only with OPENAI_API_KEY set in the process environment. The user explicitly
authorized this adapter after the bundled imagegen CLI could not save responses.
Raw responses are private intermediates in the repository's ignored directory.
No automatic generation retry: a lost response can still represent a billed job.
"""

import base64
import concurrent.futures
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

OUTPUT = Path(__file__).resolve().parent
RESPONSES = OUTPUT.parents[1] / ".assets-raw" / "imagegen-responses"
BASE_URL = "https://rolldek.com/v1"
MODEL = "gpt-image-2.5"


def save_image(job, response):
    items = response.get("data", [])
    if not items:
        raise ValueError("Response has no image data; raw response retained")
    item = items[0]
    if item.get("b64_json"):
        data = base64.b64decode(item["b64_json"], validate=True)
    elif item.get("url"):
        url = item["url"]
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https":
            raise ValueError("Image response URL must use HTTPS")
        # Asset URLs can be signed; do not log them or forward the API key.
        with urllib.request.urlopen(url, timeout=120) as result:
            data = result.read(30 * 1024 * 1024 + 1)
        if len(data) > 30 * 1024 * 1024:
            raise ValueError("Image exceeds 30 MB")
    else:
        raise ValueError(f"No image URL or Base64; response fields: {list(item)}")

    destination = OUTPUT / job["out"]
    temporary = destination.with_suffix(".download")
    temporary.write_bytes(data)
    with Image.open(temporary) as image:
        image.verify()
    # Normalize the file format while retaining any actual alpha channel.
    with Image.open(temporary) as image:
        image.save(destination, format="PNG")
        dimensions = image.size
    temporary.unlink()
    return dimensions


def generate(job, key):
    destination = OUTPUT / job["out"]
    raw = RESPONSES / (destination.stem + ".json")
    if destination.exists():
        print(f"{destination.name}: already saved", flush=True)
        return
    if raw.exists():
        response = json.loads(raw.read_text(encoding="utf-8"))
        print(f"{destination.name}: recovering saved response", flush=True)
    else:
        print(f"{destination.name}: generating", flush=True)
        payload = {
            "model": MODEL,
            "prompt": job["prompt"],
            "n": 1,
            "size": "1024x1024",
            "quality": "high",
            "output_format": "png",
        }
        request = urllib.request.Request(
            BASE_URL + "/images/generations",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "Bearer " + key,
                     "Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=900) as result:
                response_bytes = result.read()
        except urllib.error.HTTPError as error:
            # Store diagnostics privately. Do not print credentials or response URLs.
            (RESPONSES / (destination.stem + ".error.txt")).write_bytes(error.read())
            raise RuntimeError(f"HTTP {error.code}; diagnostics saved privately") from None
        raw.write_bytes(response_bytes)
        response = json.loads(response_bytes)
        print(f"{destination.name}: response saved after {time.monotonic()-started:.0f}s", flush=True)
    size = save_image(job, response)
    print(f"{destination.name}: saved {size[0]}x{size[1]}", flush=True)


def main():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("Set OPENAI_API_KEY in the process environment")
    RESPONSES.mkdir(parents=True, exist_ok=True)
    jobs = [json.loads(line) for line in (OUTPUT / "prompts.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(generate, job, key): job for job in jobs}
        for future in concurrent.futures.as_completed(futures):
            job = futures[future]
            try:
                future.result()
            except Exception as error:
                failed.append(job["out"])
                print(f"{job['out']}: {type(error).__name__}: {error}", flush=True)
    if failed:
        raise SystemExit(f"Not saved: {', '.join(failed)}")
    print("All six original images saved.", flush=True)


if __name__ == "__main__":
    main()
