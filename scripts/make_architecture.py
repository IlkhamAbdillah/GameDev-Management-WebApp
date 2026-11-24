#!/usr/bin/env python3
"""Render docs/architecture.png (request flow, data flow, security boundary). Needs matplotlib."""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "architecture.png"
FRONTEND_COPY = ROOT / "frontend" / "public" / "architecture.png"  # shown on the /docs page
BG, PANEL, LINE, TEXT, MUTED = "#0d111a", "#151b27", "#3a4660", "#e6eaf2", "#8b97ad"
BLUE, GREEN, ORANGE, PURPLE, RED = "#6d8cff", "#4fbf8b", "#f0a04b", "#b08cff", "#ff7a7a"

fig, ax = plt.subplots(figsize=(16, 10.6), dpi=130)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.set_xlim(0, 160)
ax.set_ylim(0, 106)
ax.axis("off")


def box(x, y, w, h, title, sub="", color=BLUE, fill=PANEL):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.5", fc=fill, ec=color, lw=1.8))
    ax.text(x + w / 2, y + h / 2 + (1.6 if sub else 0), title, ha="center", va="center", color=TEXT, fontsize=10.5, fontweight="bold")
    if sub:
        ax.text(x + w / 2, y + h / 2 - 2.2, sub, ha="center", va="center", color=MUTED, fontsize=8)


def arrow(a, b, color=BLUE, style="-", label="", rad=0.0, lw=1.8, label_xy=None):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=14, color=color, lw=lw, linestyle=style, connectionstyle=f"arc3,rad={rad}"))
    if label:
        x, y = label_xy or ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.6)
        ax.text(x, y, label, ha="center", va="center", color=color, fontsize=8, bbox=dict(fc=BG, ec="none", pad=1.2))


ax.text(80, 102, "GameVault — AWS serverless architecture", ha="center", color=TEXT, fontsize=17, fontweight="bold")
ax.text(80, 98.6, "Manage Assets. Track Progress. Build Games.", ha="center", color=MUTED, fontsize=10)

# security boundary: the AWS account / region
ax.add_patch(FancyBboxPatch((44, 4), 114, 87, boxstyle="round,pad=0.4,rounding_size=2", fc="none", ec=ORANGE, lw=1.6, linestyle=(0, (6, 4))))
ax.text(46, 88.4, "AWS account · us-east-1  (security boundary: three public Function URLs; a token is required except on /health and /auth/login)", color=ORANGE, fontsize=8.5, ha="left")

box(3, 37, 34, 18, "Frontend / API client", "React + TS (Vite) · Postman · curl", PURPLE)

# row 0: authentication
box(50, 73, 34, 12, "Lambda Function URL", "Auth API (HTTPS, CORS)", BLUE)
box(96, 73, 34, 12, "GameVaultAuthHandler", "Python 3.12 · /auth /users /health", GREEN)
box(138, 74, 18, 10, "DynamoDB", "GameVaultUsers", ORANGE)
# row 1: tasks
box(50, 56, 34, 14, "Lambda Function URL", "Task / Timeline API (HTTPS, CORS)", BLUE)
box(96, 56, 34, 14, "GameVaultTaskHandler", "Python 3.12 · /tasks /timeline /health", GREEN)
box(138, 58, 18, 10, "DynamoDB", "GameVaultTasks", ORANGE)
# row 2: assets
box(50, 32, 34, 14, "Lambda Function URL", "Asset API (HTTPS, CORS)", BLUE)
box(96, 32, 34, 14, "GameVaultAssetHandler", "Python 3.12 · /assets /folders /health", GREEN)
box(138, 41, 18, 9, "DynamoDB", "GameVaultAssets", ORANGE)
box(138, 30, 18, 9, "DynamoDB", "GameVaultFolders", ORANGE)
# row 3: storage + platform services
box(96, 8, 34, 11, "Amazon S3 (private bucket)", "Block Public Access · SSE-S3", PURPLE)
box(138, 17.5, 18, 8, "IAM role", "LabRole · all 3 Lambdas", RED)
box(138, 7, 18, 8, "CloudWatch Logs", "/aws/lambda/…", MUTED)

# request flow
arrow((37, 54), (50, 79), BLUE, label="1 · REST/JSON\n+ bearer token", label_xy=(40, 69))
arrow((84, 79), (96, 79), BLUE, label="2 · invoke")
arrow((130, 79), (138, 79), GREEN, label="3 · data", label_xy=(134, 81.5))
arrow((37, 51), (50, 63), BLUE, label="1 · REST/JSON", label_xy=(40.5, 59.5))
arrow((37, 43), (50, 39), BLUE, label="1 · REST/JSON", label_xy=(41.5, 37))
arrow((84, 63), (96, 63), BLUE, label="2 · invoke")
arrow((84, 39), (96, 39), BLUE, label="2 · invoke")
# data flow
arrow((130, 63), (138, 63), GREEN, label="3 · data", label_xy=(134, 65.5))
arrow((130, 43), (138, 45.5), GREEN, label="3 · data", label_xy=(134, 48.3))
arrow((130, 36), (138, 34.5), GREEN)
arrow((113, 32), (113, 19), GREEN, label="3 · object ops\n(sign URLs, delete)", label_xy=(122, 25.5))
# direct upload / download via pre-signed URL (never through Lambda)
arrow((20, 37), (96, 12.5), PURPLE, style=(0, (5, 3)), label="4 · file upload / download straight to S3\nvia short-lived pre-signed URL (no AWS keys in the browser)", rad=0.0, label_xy=(62, 11))

# legend
ax.text(3, 28, "Legend", color=TEXT, fontsize=9, fontweight="bold")
for i, (c, st, t) in enumerate([(BLUE, "-", "Request flow"), (GREEN, "-", "Data flow"), (PURPLE, "--", "Direct S3 transfer (pre-signed)")]):
    y = 24.5 - i * 3.2
    ax.plot([3, 9], [y, y], color=c, lw=2, linestyle=st if st != "--" else (0, (5, 3)))
    ax.text(11, y, t, color=MUTED, fontsize=8, va="center")
ax.text(3, 9, "Sign-in: scrypt password → HS256 JWT (8 h),\nverified inside every Lambda (Function URLs\nhave no authorizer). Roles: project manager, member.", color=RED, fontsize=8, va="center")

fig.savefig(OUT, facecolor=BG, bbox_inches="tight", pad_inches=0.3)
FRONTEND_COPY.parent.mkdir(exist_ok=True)
FRONTEND_COPY.write_bytes(OUT.read_bytes())
print(f"wrote {OUT} and {FRONTEND_COPY}")
