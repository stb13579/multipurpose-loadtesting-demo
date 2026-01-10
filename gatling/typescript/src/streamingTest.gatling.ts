import {
  Session,
  simulation,
  scenario,
  atOnceUsers
} from "@gatling.io/core";
import { grpc, statusCode } from "@gatling.io/grpc";

export default simulation((setUp) => {
  // Server configuration with plaintext mode
  const telemetryServer = grpc
    .serverConfiguration("telemetry")
    .forAddress("127.0.0.1", 50051)
    .usePlaintext();  // Required for non-TLS connections

  const testProtocol = grpc.serverConfigurations(telemetryServer);

  // Helper to build time range for historical queries
  const buildTimeRange = () => {
    const endSeconds = Math.floor(Date.now() / 1000);
    const startSeconds = endSeconds - 3600; // Last hour
    return {
      start: { seconds: startSeconds, nanos: 0 },
      end: { seconds: endSeconds, nanos: 0 }
    };
  };

  // Server streaming test: QueryTelemetryHistory
  const historyStream = grpc("QueryTelemetryHistory")
    .serverStream("telemetry.v1.TelemetryService/QueryTelemetryHistory")
    .check(statusCode().is("OK"));

  const streamingScenario = scenario("Streaming Test")
    .exec((session: Session) => {
      const timeRange = buildTimeRange();
      return session.set("timeRange", timeRange);
    })
    .exec(
      historyStream.send((session: Session) => ({
        vehicle_ids: [],
        range: session.get("timeRange"),
        limit: 100
      })),
      historyStream.awaitStreamEnd()
    );

  setUp(streamingScenario.injectOpen(atOnceUsers(1))).protocols(testProtocol);
});
