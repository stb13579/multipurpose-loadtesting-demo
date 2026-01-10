# Gatling gRPC Load Tests for Vehicle Telemetry

This directory contains Gatling load tests for the Vehicle Telemetry gRPC service.

## Directory Structure

```
gatling/
└── typescript/
    ├── src/
    │   └── telemetryGrpcSimulation.gatling.ts  # Main simulation file
    ├── protobuf/
    │   └── telemetry.proto                      # gRPC service definition
    ├── resources/
    │   ├── certs/                               # TLS certificates (if needed)
    │   ├── gatling.conf                         # Gatling configuration
    │   └── logback-test.xml                     # Logging configuration
    ├── package.json
    └── tsconfig.json
```

## Prerequisites

1. **Node.js v20+** installed

2. **Backend running with gRPC enabled**:
   ```bash
   cd ../../
   GRPC_PORT=50051 npm run backend
   ```

3. **Telemetry data populated** (for historical queries):
   ```bash
   # Generate test data
   npm run simulate -- --vehicles=25 --max-messages=500 --rate=200ms

   # Compute rollups
   npm run rollups
   ```

## Installation

Navigate to the TypeScript directory and install dependencies:

```bash
cd typescript
npm install
```

Build the simulation to verify setup:

```bash
npm run build
```

This will compile TypeScript and bundle the proto files. You should see:
```
Bundling a Gatling simulation with options:
 - sourcesFolder: src
 - protoFolder: protobuf
 - bundleFile: target/bundle.js
 - typescript: true
```

> **Note**: The `protobuf/` directory includes `google/protobuf/timestamp.proto` to resolve imports in `telemetry.proto`. See [typescript/SETUP.md](typescript/SETUP.md) for details on the protobuf import setup.

## Running Tests

### Basic Usage

Run with default parameters (localhost:50051, plaintext):

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation
```

### Load Profiles

The simulation supports different load profiles via the `loadProfile` parameter:

| Profile | Description | Use Case |
|---------|-------------|----------|
| `smoke` | 1 user per scenario | Quick validation |
| `fleet` | Heavy fleet snapshot queries | Test live data endpoint |
| `history` | Heavy historical queries | Test historical streaming |
| `stream` | Long-lived streaming connections | Test real-time streams |
| `aggregates` | Analytics-focused load | Test aggregation queries |
| `mixed` | Balanced mix (default) | Realistic traffic simulation |

Example:

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation \
  loadProfile=smoke
```

### Configuration Parameters

All parameters are passed as `key=value` pairs after the `--simulation` flag:

#### Connection Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `grpcHost` | `localhost` | gRPC server hostname |
| `grpcPort` | `50051` | gRPC server port |
| `grpcTls` | `false` | Enable TLS (`true`/`false`) |

#### Load Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `loadProfile` | `mixed` | Load profile (see above) |
| `testDurationSeconds` | `60` | Test duration in seconds |
| `fleetUsers` | `5` | Virtual users for fleet queries |
| `historyUsers` | `5` | Virtual users for history queries |
| `streamUsers` | `2` | Virtual users for streaming |
| `aggregateUsers` | `3` | Virtual users for aggregates |

#### Query Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `windowSeconds` | `300` | Aggregation window (5 minutes) |
| `historyDurationSeconds` | `3600` | Time range for history queries (1 hour) |
| `requireHistoryData` | `false` | Fail checks if no historical data |

### Example Commands

#### Smoke Test (Quick Validation)

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation \
  loadProfile=smoke \
  grpcHost=localhost \
  grpcPort=50051 \
  grpcTls=false
```

#### Realistic Mixed Load (60 seconds)

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation \
  loadProfile=mixed \
  testDurationSeconds=60 \
  fleetUsers=10 \
  historyUsers=5 \
  streamUsers=3 \
  aggregateUsers=5
```

#### Heavy Historical Query Load

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation \
  loadProfile=history \
  testDurationSeconds=120 \
  historyUsers=20 \
  historyDurationSeconds=7200 \
  requireHistoryData=true
```

#### Stream Testing (Long-lived Connections)

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation \
  loadProfile=stream \
  streamUsers=10
```

#### Against Remote Server with TLS

```bash
npx gatling run --typescript --simulation telemetryGrpcSimulation \
  grpcHost=telemetry.example.com \
  grpcPort=443 \
  grpcTls=true \
  loadProfile=mixed
```

## Test Scenarios

The simulation includes 4 scenarios that test all gRPC endpoints:

### 1. Get Fleet Snapshot
- **RPC**: `GetFleetSnapshot` (unary)
- **Tests**:
  - Query all vehicles with metrics
  - Query specific vehicles
- **Checks**: Response contains snapshots and metrics

### 2. Query Telemetry History
- **RPC**: `QueryTelemetryHistory` (server streaming)
- **Tests**:
  - Stream all vehicle history
  - Stream specific vehicle history with pagination
- **Checks**: Valid status code, optional data validation

### 3. Get Historical Aggregates
- **RPC**: `GetHistoricalAggregates` (unary)
- **Tests**:
  - Query all aggregate types (speed, fuel, distance)
  - Query specific aggregates for filtered vehicles
- **Checks**: Response contains time-bucketed metrics

### 4. Stream Vehicle Snapshots
- **RPC**: `StreamVehicleSnapshots` (server streaming)
- **Tests**:
  - Long-lived streaming connections
  - Real-time snapshot delivery
- **Checks**: Stream establishes successfully

## Results

After each test run, Gatling generates an HTML report:

```
typescript/target/gatling/<timestamp>/index.html
```

Open this file in a browser to view:
- Request/response times
- Success/failure rates
- Throughput metrics
- Response time percentiles

## Certificates and TLS

Currently, the backend uses **plaintext (insecure) gRPC**. To enable TLS:

1. Generate certificates using the `certificates.sh` script from the Gatling demo:
   ```bash
   # Copy and adapt the script
   cp /path/to/gatling-grpc-demo/certificates.sh ./gatling/

   # Edit the script to update paths and CNs
   # Then run it
   ./gatling/certificates.sh
   ```

2. Update backend to use TLS credentials in [grpc-service.js:237](../../backend/services/grpc-service.js#L237):
   ```javascript
   // Replace:
   grpc.ServerCredentials.createInsecure()

   // With:
   grpc.ServerCredentials.createSsl(
     fs.readFileSync('certs/ca.crt'),
     [{
       cert_chain: fs.readFileSync('certs/server.crt'),
       private_key: fs.readFileSync('certs/server.key')
     }]
   )
   ```

3. Run tests with `grpcTls=true` and ensure certificates are in `resources/certs/`.

## Troubleshooting

### "Connection refused" or "Failed to connect"
- Ensure backend is running: `GRPC_PORT=50051 npm run backend`
- Check the port matches: `grpcPort=50051`
- Verify gRPC is enabled in `.env`: `GRPC_ENABLED=true`

### "No historical data" in history queries
- Generate telemetry: `npm run simulate -- --vehicles=25 --max-messages=500`
- Compute rollups: `npm run rollups`
- Or run: `npm run grpc-warmup` (if available)

### TypeScript compilation errors
- Run `npm run check` to validate TypeScript
- Run `npm run format` to auto-format code
- Ensure Node.js v20+ is installed

### Empty aggregates in response
- Check `windowSeconds` matches backend rollup configuration
- Verify `TELEMETRY_ROLLUP_WINDOW_SECONDS` in backend `.env`
- Run rollup worker: `npm run rollups`

## Testing with Gatling Enterprise

To run these tests on [Gatling Enterprise Cloud](https://gatling.io/products/), you need a publicly accessible gRPC endpoint. Here are two options:

### Option 1: Railway (Recommended for Persistent Endpoint)

Deploy your backend to Railway for a stable, always-on endpoint that's perfect for repeated testing and demos.

**Steps:**

1. **Prepare your project**:
   ```bash
   # Ensure you have a Dockerfile or Railway will auto-detect Node.js
   # Make sure GRPC_ENABLED=true and GRPC_PORT=50051 in your env
   ```

2. **Deploy to Railway**:
   - Sign up at [railway.app](https://railway.app)
   - Create new project from your GitHub repo
   - Railway auto-detects and deploys
   - Set environment variables:
     - `GRPC_ENABLED=true`
     - `GRPC_PORT=50051`
     - `DATABASE_URL` (if using PostgreSQL service)

3. **Get your public endpoint**:
   ```
   your-app.up.railway.app:50051
   ```

4. **Configure Gatling Enterprise** to use:
   ```bash
   grpcHost=your-app.up.railway.app
   grpcPort=50051
   grpcTls=false
   ```

**Pros:**
- ✅ Persistent endpoint (same URL every time)
- ✅ Free tier available ($5 credit/month)
- ✅ Auto-deploys from GitHub
- ✅ Great for demos and documentation

**Cons:**
- ⚠️ Requires initial deployment setup
- ⚠️ Free tier credit may run out under heavy load testing

### Option 2: ngrok (Quick Testing Without Deployment)

Expose your local server temporarily through a secure tunnel. Perfect for one-off tests or trying Gatling Enterprise before committing to deployment.

**Steps:**

1. **Start your backend locally**:
   ```bash
   GRPC_PORT=50051 npm run backend
   ```

2. **Install and run ngrok** (free tier supports TCP):
   ```bash
   # Install
   brew install ngrok

   # Sign up and authenticate
   ngrok config add-authtoken YOUR_TOKEN

   # Expose your gRPC port
   ngrok tcp 50051
   ```

3. **Copy the forwarding address**:
   ```
   Forwarding: tcp://0.tcp.ngrok.io:12345 -> localhost:50051
   ```

4. **Configure Gatling Enterprise** to use:
   ```bash
   grpcHost=0.tcp.ngrok.io
   grpcPort=12345
   grpcTls=false
   ```

**Pros:**
- ✅ No deployment needed
- ✅ Test immediately
- ✅ Free tier includes TCP tunnels
- ✅ Perfect for quick POCs

**Cons:**
- ⚠️ **Ephemeral URLs** - address changes each time you restart ngrok
- ⚠️ Need to update Gatling Enterprise config with new URL each session
- ⚠️ Bandwidth limits on free tier
- ⚠️ Not suitable for long-running or scheduled tests

### Recommendation

- **For demos and documentation**: Use Railway for a persistent endpoint
- **For quick Enterprise trial**: Use ngrok to test without deployment
- **For production load testing**: Deploy to a proper cloud provider with TLS enabled

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Run gRPC Load Tests
  working-directory: gatling/typescript
  run: |
    npm install
    npx gatling run --typescript --simulation telemetryGrpcSimulation \
      loadProfile=smoke \
      grpcHost=localhost \
      grpcPort=50051 \
      requireHistoryData=false
```

## Development

### Build the simulation
```bash
npm run build
```

### Format code
```bash
npm run format
```

### Type check
```bash
npm run check
```

### Clean build artifacts
```bash
npm run clean
```
