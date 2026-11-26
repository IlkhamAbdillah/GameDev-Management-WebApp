#!/usr/bin/env python3
"""Create an account in GameVaultUsers directly (there is no public registration; default: a project manager).

Usage:  AWS_SHARED_CREDENTIALS_FILE=.aws/credentials AWS_CONFIG_FILE=.aws/config AWS_DEFAULT_REGION=us-east-1 \
        AWS_PROFILE=awsstudent .venv/bin/python scripts/seed_admin.py --email you@example.com --name "Your Name" [--role member]

Use the awsstudent profile: the default voclabs role cannot write DynamoDB items directly.
The password is read from the GV_ADMIN_PASSWORD environment variable or, if unset, prompted for
without echo. It is never printed or written to disk. Existing emails are left untouched.
Used for the first project manager (and by scripts/deploy_all.sh to seed demo members); further
users are normally added by a project manager in the app (Team page).
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend" / "shared"), str(ROOT / "backend" / "auth-handler")]

from auth import PROJECT_MANAGER, ROLES, hash_password  # noqa: E402
from database import UserRepository  # noqa: E402
from validation import ValidationError, validate_user_payload  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", choices=ROLES, default=PROJECT_MANAGER)
    parser.add_argument("--table", default="GameVaultUsers")
    args = parser.parse_args()

    password = os.environ.get("GV_ADMIN_PASSWORD") or getpass.getpass("Password (min 8 chars): ")
    try:
        fields = validate_user_payload(
            {"name": args.name, "email": args.email, "password": password, "role": args.role}
        )
    except ValidationError as err:
        sys.exit(f"Invalid input: {err}")

    repo = UserRepository.from_table_name(args.table)
    if repo.get_by_email(fields["email"]):
        print(f"{fields['email']} already exists; nothing changed.")
        return
    fields["passwordHash"] = hash_password(fields.pop("password"))
    user = repo.create(fields)
    print(f"created {user['role']} {user['email']} (userId {user['userId']})")


if __name__ == "__main__":
    main()
