"""Demonstrate a four-digit PIN search using a simulated verifier.

Install with: python3 -m pip install 'pypdf[crypto]' reportlab
Run with: python3 pdf_pin_demo.py
"""

from hashlib import sha256
from io import BytesIO
from secrets import randbelow, token_bytes
from time import perf_counter

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen.canvas import Canvas


DEMO_TEXT = "Synthetic PDF for an information security class."
PIN_SPACE_SIZE = 10_000


def create_demo_pdf(pin: str) -> BytesIO:
    plain_pdf = BytesIO()
    canvas = Canvas(plain_pdf)
    canvas.drawString(72, 740, DEMO_TEXT)
    canvas.save()
    plain_pdf.seek(0)

    writer = PdfWriter(clone_from=plain_pdf)
    writer.encrypt(pin, algorithm="AES-256")
    encrypted_pdf = BytesIO()
    writer.write(encrypted_pdf)
    encrypted_pdf.seek(0)
    return encrypted_pdf


def recover_demo_pin(salt: bytes, target_digest: bytes) -> tuple[str, int, float]:
    start = perf_counter()
    for value in range(PIN_SPACE_SIZE):
        candidate = f"{value:04d}"
        if sha256(salt + candidate.encode("ascii")).digest() == target_digest:
            return candidate, value + 1, perf_counter() - start
    raise RuntimeError("The simulated verifier had no matching PIN.")


def main() -> None:
    demo_pin = f"{randbelow(PIN_SPACE_SIZE):04d}"
    demo_pdf = create_demo_pdf(demo_pin)

    # Time the simulated PIN search independently of PDF encryption and opening.
    salt = token_bytes(16)
    target_digest = sha256(salt + demo_pin.encode("ascii")).digest()
    recovered_pin, guesses, elapsed = recover_demo_pin(salt, target_digest)

    reader = PdfReader(demo_pdf)
    if not reader.is_encrypted or not reader.decrypt(recovered_pin):
        raise RuntimeError("The recovered PIN did not open the encrypted demo PDF.")
    if reader.pages[0].extract_text().strip() != DEMO_TEXT:
        raise RuntimeError("The opened PDF did not contain the demo text.")

    print(f"Recovered demo PIN: {recovered_pin}")
    print(f"Guesses: {guesses:,} of {PIN_SPACE_SIZE:,}")
    print(f"Simulated search time: {elapsed * 1_000:.3f} ms")
    print("Verified the PIN by opening the generated AES-256 PDF.")


if __name__ == "__main__":
    main()
