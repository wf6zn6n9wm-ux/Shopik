#!/usr/bin/env python3
"""Збірка застосунку: вшиває шрифти в app.html і робить два файли.

    python3 build.py

  app.dist.html   — тіло сторінки, для вбудовування
  index.html      — самодостатня сторінка з <!doctype>, її й деплоїмо

Шрифти лежать поруч, у fonts/ — жодних зовнішніх завантажень: політика
безпеки сторінки блокує будь-який зовнішній хост, тому обидва накреслення
JetBrains Mono вшиваються в CSS як data URI.
"""
import base64
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
FACES = [
    ('JBMono', 'JetBrainsMono-Regular.ttf', 400),
    ('JBMono', 'JetBrainsMono-Bold.ttf', 700),
]
TITLE = '<title>Холодильник+</title>'


def main() -> int:
    src = (HERE / 'app.html').read_text(encoding='utf-8')
    if '/*FONTS*/' not in src:
        print('помилка: в app.html немає маркера /*FONTS*/', file=sys.stderr)
        return 1

    faces = []
    for family, filename, weight in FACES:
        path = HERE / 'fonts' / filename
        if not path.exists():
            print(f'помилка: немає {path}', file=sys.stderr)
            return 1
        b64 = base64.b64encode(path.read_bytes()).decode('ascii')
        faces.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%d;"
            "font-display:swap;src:url(data:font/ttf;base64,%s) format('truetype')}"
            % (family, weight, b64)
        )

    body = src.replace('/*FONTS*/', '\n'.join(faces))
    (HERE / 'app.dist.html').write_text(body, encoding='utf-8')

    page = (
        '<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,'
        'viewport-fit=cover">\n'
        '<meta name="theme-color" content="#F3E5E5">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        + TITLE + '\n</head>\n<body>\n'
        + body.replace(TITLE, '', 1).strip()
        + '\n</body>\n</html>\n'
    )
    (HERE / 'index.html').write_text(page, encoding='utf-8')

    print('app.dist.html  %6.0f KB' % (len(body) / 1024))
    print('index.html     %6.0f KB' % (len(page) / 1024))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
