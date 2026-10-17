"""Генерирует prompts/images.prompt из демо-контента (content/*.json).

Запуск из корня проекта:  python -m tools.build_prompts
Каждая запись = файл, который нужно положить в frontend/assets/img/<путь>.
Пока файла нет, сайт показывает сгенерированную заглушку.
"""
from pathlib import Path

import json

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prompts" / "images.prompt"
SPECIALISTS = json.loads((ROOT / "content" / "specialists.json").read_text(encoding="utf-8"))
PROJECTS = json.loads((ROOT / "content" / "projects.json").read_text(encoding="utf-8"))
# проект демо-аккаунта (backend/app/db/demo.py)
DEMO_PROJECT = {"slug": "zerno-demo", "title": "Зерно", "category": "Дизайн",
                "prompt": "cozy coffee shop coworking with large windows, wooden communal table, people working on laptops, "
                          "warm morning light, terracotta and cream interior with lavender accents"}

PALETTE = "palette: cream #FFFBF5, lavender #A996F5 / #6C55F5, warm orange #FF6A2C, ink #111114"

STYLE_3D = ("soft matte clay 3D render, velvety micro-texture, rounded organic forms, soft global illumination, "
            "gentle contact shadows, " + PALETTE + ", minimal, premium, no text, no logos, no watermark")
STYLE_PORTRAIT = ("photorealistic studio headshot, head and shoulders, looking at camera, soft natural window light from the left, "
                  "warm neutral beige seamless background #EFE8DD, shallow depth of field, 85mm lens, natural skin texture, "
                  "editorial, friendly and confident, no text, no watermark")
STYLE_LOGO = ("minimal flat vector logo mark, perfectly centered, generous padding, solid background filling the whole square, "
              "crisp geometric shapes, no text, no letters, no watermark")
STYLE_WORK = ("high-end portfolio cover image, professional art direction, balanced composition, rich but soft colors, "
              "no readable text, no logos, no watermark")
STYLE_PROJECT = ("wide key visual for a project card, cinematic composition with the subject centered (edges may be cropped), "
                 "high detail, no readable text, no logos, no watermark")

ILLUSTRATIONS = [
    ("illustrations/services.webp", "1600x1000",
     "Hero illustration for the SPECIALISTS page: a loose floating arc of creative tools made of soft clay — a pencil, a code bracket symbol, "
     "a camera, a microphone, a paint brush, a tiny gear and a ruler — orbiting a small orange sphere, thin lavender orbit lines connecting them. "
     "Cream background #FFFBF5 that fades out at the edges. " + STYLE_3D),
    ("illustrations/projects.webp", "1600x1000",
     "Hero illustration for the PROJECTS page: a playful staircase of rounded lavender blocks growing from small to tall, an orange ball "
     "rolling up the steps leaving a dotted trail, a little flag on the top block, a lightbulb-shaped cloud. Idea grows into a product. "
     "Cream background #FFFBF5 fading at the edges. " + STYLE_3D),
    ("illustrations/about.webp", "1600x1000",
     "Hero illustration for the ABOUT page: a group of different soft shapes (sphere, cube, cone, torus, capsule) gathered around a round "
     "low table like a team in conversation, one orange sphere in the middle glowing slightly, thin orbit lines linking them. "
     "Cream background #FFFBF5 fading at the edges. " + STYLE_3D),
    ("illustrations/auth.webp", "1600x1200",
     "Illustration for LOGIN and SIGN-UP pages: a tall arched doorway / portal made of a thick lavender tube standing on a soft plinth, "
     "warm orange light glowing from inside the arch, an orange ball rolling towards the doorway along a curved path, a few small floating "
     "lavender spheres and thin orbit lines. Welcoming feeling. Cream background #FFFBF5 fading at the edges. " + STYLE_3D),
    ("illustrations/about-team.webp", "1600x600",
     "Candid photo of a diverse team of four young creatives (two women, two men) laughing around a laptop at a wooden table in a sunny "
     "loft studio with plants and moodboards on the wall, warm natural light, orange and black clothing accents, shallow depth of field, "
     "editorial photography, no readable text"),
    ("illustrations/profile-banner.webp", "2400x400",
     "Very wide abstract banner: soft lavender clay tube loops drifting across a pale lilac background #ECE6FF with a partially visible "
     "orange sphere on the right and a thin orbit line, lots of calm empty space on the left. " + STYLE_3D),
]


def block(path: str, size: str, prompt: str, note: str = "") -> str:
    head = f"[{path}]  {size}" + (f"  — {note}" if note else "")
    return f"{head}\n{prompt}\n"


def main() -> None:
    parts = [
        "# ============================================================",
        "# Среда — промпты для всех изображений сайта",
        "# Файл сгенерирован: python -m tools.build_prompts",
        "# Hero главной — векторный моушен в коде (frontend/assets/js/pages/hero-motion.js), картинки для него не нужны.",
        "# Формат записи:  [путь в frontend/assets/img]  размер  — комментарий",
        "#                 промпт (на английском — так стабильнее для генераторов)",
        "# Пока файла нет, сайт рисует аккуратную заглушку — можно заливать постепенно.",
        "# Сохраняйте в .webp (качество 85) или .png там, где нужна прозрачность.",
        "# ============================================================",
        "",
        "## ОБЩИЙ СТИЛЬ",
        f"# 3D-иллюстрации: {STYLE_3D}",
        f"# Портреты: {STYLE_PORTRAIT}",
        f"# Логотипы студий: {STYLE_LOGO}",
        "",
    ]
    parts += ["## 1. ИЛЛЮСТРАЦИИ СТРАНИЦ (у каждой страницы своя; вход и регистрация — общая)", ""]
    parts += [block(p, s, t) for p, s, t in ILLUSTRATIONS]

    parts += [f"## 2. АВАТАРЫ И ЛОГОТИПЫ ({len(SPECIALISTS)} шт.)", ""]
    for s in SPECIALISTS:
        if s["kind"] == "studio":
            parts.append(block(f"people/{s['slug']}.webp", "1024x1024", f"Logo for «{s['name']}» ({s['role']}): {s['look']}. {STYLE_LOGO}", "логотип студии"))
        else:
            parts.append(block(f"people/{s['slug']}.webp", "1024x1024", f"{STYLE_PORTRAIT}. Subject: {s['look']}.", f"{s['name']}, {s['role']}"))

    total = sum(len(s["portfolio"]) for s in SPECIALISTS)
    parts += [f"## 3. ПОРТФОЛИО ({total} шт., первая работа — ещё и обложка карточки специалиста)", ""]
    for s in SPECIALISTS:
        for i, w in enumerate(s["portfolio"], 1):
            parts.append(block(f"portfolio/{s['slug']}-{i}.webp", "1600x1200",
                               f"{w['prompt']}. {STYLE_WORK}", f"{s['name']} — «{w['title']}», {w['meta']}"))

    projects = PROJECTS + [DEMO_PROJECT]
    parts += [f"## 4. ОБЛОЖКИ ПРОЕКТОВ ({len(projects)} шт., последняя — проект демо-аккаунта)", ""]
    for p in projects:
        parts.append(block(f"projects/{p['slug']}.webp", "1600x900",
                           f"{p['prompt']}. {STYLE_PROJECT}", f"«{p['title']}» — {p['category']}"))

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(parts), encoding="utf-8")
    count = len(ILLUSTRATIONS) + len(SPECIALISTS) + total + len(projects)
    print(f"{OUT.relative_to(ROOT)}: {count} изображений")


if __name__ == "__main__":
    main()
