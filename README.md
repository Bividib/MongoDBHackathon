# MongoDB Hackathon

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file from `.env.example` and set your Atlas connection string:

```bash
MONGO_DB_CONNECTION="mongodb+srv://..."
```

Check the Atlas connection:

```bash
npm run check:db
```

Check which local provider keys are configured:

```bash
npm run check:env
```

Check provider authentication:

```bash
npm run check:providers
```

List outbound-capable ElevenLabs phone numbers:

```bash
npm run elevenlabs:phones
```

Import the configured Twilio number into ElevenLabs:

```bash
npm run elevenlabs:import-twilio
```

Assign the imported ElevenLabs phone number to the configured agent:

```bash
npm run elevenlabs:assign-agent
```

Submit a dry-run outbound call request:

```bash
npm run call:test -- --to 07490000000 --purpose "Confirm payment timing for INV-1042"
```

Add `--send` only when the recipient has consented to receive the test call.

Validate the synthetic data pack:

```bash
npm run check:data
```

Seed or reset the demo database:

```bash
npm run seed
npm run reset
```
