Файлы для картинок превью ссылок (`opengraph-image`): генератор `next/og` не читает WOFF2 и не видит CSS сайта.

- `*.ttf` — те же шрифты, что в `public/fonts/` (Prata, Playfair Display, PT Sans; лицензия SIL Open Font License 1.1),
  распакованные из WOFF2 и склеенные из кириллического и латинского наборов; у Playfair зафиксировано начертание 500.
  В `Prata-Regular.ttf` цифры заменены на цифры Playfair Display, как и на сайте (у Prata единица неотличима от «l»);
  замену делает `scripts/fonts/prata-digits.py`.
- `mark*.svg`, `wordmark.svg` — копии логотипа из `public/brand/`.
