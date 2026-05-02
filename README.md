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

Validate the synthetic data pack:

```bash
npm run check:data
```

Seed or reset the demo database:

```bash
npm run seed
npm run reset
```
