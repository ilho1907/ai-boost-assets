# ilhova — Landingpage

> **Frauen unterstützen Frauen — Hand in Hand.**

Eine animierte Landingpage für **ilhova**, die Plattform für die neue Generation
von Lebenscoaches. ilhova begleitet Coaches dabei, sich in ihrer Nische zu
spezialisieren, KI als Werkzeug zu meistern und ihre Sichtbarkeit authentisch
anzupassen — mit Workbooks, Workshops, Landingpages und einer Community, die
gemeinsam wächst.

## Inhalte / Sektionen

- **Hero** mit animierten Blüten, Statistik-Zähler und CTA
- **Vision** – die Idee hinter ilhova (korrigierter, klarer deutscher Text)
- **Angebote** – die 7 Wege:
  - 🌸 Retreat
  - ✶ Workbook
  - ◈ Workshop
  - ❖ Kurs
  - ☾ Meditation
  - ✺ Test (Nischen-Finder)
  - ♫ Podcast
- **Interviews** – Stimmen aus dem Coach-Kreis
- **Community** – „Frauen unterstützen Frauen"
- **Kontakt / Newsletter**
- **Login & Registrierung** (Modal mit Anmelden / Mitglied werden)

## Design

- **Palette:** Creme, Beige, warmes Weiß, helles Braun & Gold-Akzent
- **Typografie:** Cormorant Garamond (Serif) + Jost (Sans)
- **Animationen:** Scroll-Reveal (IntersectionObserver), schwebende Blüten,
  Lauftext-Marquee, Zähler, Hover-Effekte, Modal-Übergänge
- Vollständig **responsiv** und mit `prefers-reduced-motion`-Unterstützung

## Struktur

```
index.html        # Komplette Seite
css/style.css     # Design & Animationen
js/main.js        # Nav, Reveal, Zähler, Login-Modal, Formulare
assets/           # Platz für Bilder/Medien
```

## Lokal ansehen

Einfach `index.html` im Browser öffnen — oder:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

## Hinweise

- Login-, Registrierungs- und Newsletter-Formulare sind als **Frontend-Demo**
  umgesetzt (kein Backend). Für echte Konten kann ein Auth-Dienst angebunden werden.
- Externe Schriften werden über Google Fonts geladen; ohne Internet greifen
  saubere System-Fallbacks.
