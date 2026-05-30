import pydantic

from enums.ledger import LedgerEntryStatus
from schemas.ledger import AdminLedgerStatusPatch

s = list(LedgerEntryStatus)[0]

# status change without a note must still work
print("no note ok:", AdminLedgerStatusPatch(status=s).note)

# valid note (4000) passes
print("valid 4000 ok:", len(AdminLedgerStatusPatch(status=s, note="x" * 4000).note))

# >4000 rejected
try:
    AdminLedgerStatusPatch(status=s, note="x" * 4001)
    print("too long: ALLOWED (unexpected)")
except pydantic.ValidationError:
    print("too long: rejected")

# empty string rejected
try:
    AdminLedgerStatusPatch(status=s, note="")
    print("empty: ALLOWED")
except pydantic.ValidationError:
    print("empty: rejected")
