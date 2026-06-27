# Duygu Analizi n8n Pipeline

## Was macht dieser Workflow?

Dieses n8n-Workflow analysiert Emotionen aus **Audio**, **Video**, **Bildern** und **Text** — alles in einem einzigen Endpunkt.

## Workflow-Architektur

```
POST /webhook/emotion-analysis
         │
         ▼
   [Medientyp-Router]
   ┌─────┴─────────────────────────┐
   │         │         │           │
 audio     video     image       text
   │         │         │           │
  STT    Eden AI   Eden AI    Eden AI
 (STT)   Face+Video  Face     Text Emotion
   │         │         │           │
  Text    Ergebnis  Ergebnis   Ergebnis
 Emotion     │         │           │
   └─────────┴─────────┴───────────┘
                   │
          [Normalisierung]
                   │
           [Alarm-Check]
          ┌────────┴────────┐
       Alarm=true        Normal
          │                │
     KI-Interpretation  Direkte
     (GPT/Claude)       Antwort
          │
       JSON-Antwort
```

## Einrichtung

### 1. Eden AI API Key
- Konto erstellen: https://app.edenai.run/
- API Key kopieren
- In n8n: Credentials → HTTP Header Auth → `Bearer YOUR_KEY`

### 2. Workflow importieren
- n8n öffnen → Workflows → Import → `emotion-analysis-pipeline.json` hochladen

### 3. Webhook URL
Nach dem Aktivieren ist der Endpunkt erreichbar unter:
```
https://DEINE-N8N-INSTANZ/webhook/emotion-analysis
```

## API Verwendung

### Audio analysieren
```bash
curl -X POST https://n8n.example.com/webhook/emotion-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "audio",
    "url": "https://example.com/audio.mp3",
    "language": "de"
  }'
```

### Bild analysieren (Gesichtsemotion)
```bash
curl -X POST https://n8n.example.com/webhook/emotion-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image",
    "url": "https://example.com/face.jpg"
  }'
```

### Video analysieren
```bash
curl -X POST https://n8n.example.com/webhook/emotion-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "video",
    "url": "https://example.com/video.mp4"
  }'
```

### Text analysieren
```bash
curl -X POST https://n8n.example.com/webhook/emotion-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "text": "Ich bin heute sehr traurig und fühle mich allein.",
    "language": "de"
  }'
```

## Beispiel-Antwort

```json
{
  "status": "success",
  "emotion": "sad",
  "emotionDE": "Trauer",
  "confidence": 0.87,
  "allEmotions": {
    "sad": 0.87,
    "fear": 0.08,
    "neutral": 0.05
  },
  "alert": true,
  "aiInterpretation": "Die erkannte Trauer mit hoher Konfidenz deutet auf einen emotional belastenden Moment hin. Es empfiehlt sich, einfühlsam zu reagieren und ggf. Unterstützung anzubieten.",
  "timestamp": "2026-06-15T22:00:00.000Z"
}
```

## Erkannte Emotionen

| Englisch | Deutsch |
|----------|---------|
| happy / joy | Freude |
| sad / sadness | Trauer |
| angry / anger | Wut |
| fear | Angst |
| disgust | Ekel |
| surprise | Überraschung |
| neutral | Neutral |
| contempt | Verachtung |
| calm | Ruhe |

## Alert-Logik

Wenn `confidence > 0.7` UND Emotion ist `angry`, `fear`, `sad` → `alert: true`  
In diesem Fall wird automatisch eine KI-Interpretation generiert.

## Erweiterungsmöglichkeiten

- **Notion/Google Sheets**: Ergebnisse speichern
- **Slack/E-Mail**: Alert-Benachrichtigungen
- **Dashboard**: Emotionsverlauf visualisieren
- **Batch-Verarbeitung**: Mehrere Dateien gleichzeitig
- **emotion2vec**: Eigener Self-Hosted Server für höhere Genauigkeit
