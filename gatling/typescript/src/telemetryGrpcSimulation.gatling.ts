import {
  Session,
  simulation,
  scenario,
  atOnceUsers,
  rampUsers,
  constantUsersPerSec,
  getParameter
} from "@gatling.io/core";
import { grpc, response, statusCode } from "@gatling.io/grpc";

export default simulation((setUp) => {
  // Configuration parameters from CLI or defaults
  // Use 127.0.0.1 instead of localhost to force IPv4 (Docker compatibility)
  const grpcHost = getParameter("grpcHost") || "127.0.0.1";
  const grpcPort = parseInt(getParameter("grpcPort") || "50051");
  const windowSeconds = parseInt(getParameter("windowSeconds") || "300");
  const fleetUsers = parseInt(getParameter("fleetUsers") || "5");
  const historyUsers = parseInt(getParameter("historyUsers") || "5");
  const streamUsers = parseInt(getParameter("streamUsers") || "2");
  const aggregateUsers = parseInt(getParameter("aggregateUsers") || "3");
  const historyDurationSeconds = parseInt(getParameter("historyDurationSeconds") || "3600");
  const requireHistoryData = getParameter("requireHistoryData") === "true";
  const testDurationSeconds = parseInt(getParameter("testDurationSeconds") || "60");

  // Modern gRPC protocol configuration using server configurations
  const telemetryServer = grpc
    .serverConfiguration("telemetry")
    .forAddress(grpcHost, grpcPort)
    .usePlaintext();  // Required for non-TLS connections

  const baseGrpcProtocol = grpc.serverConfigurations(telemetryServer);

  // Helper to build TimeRange for historical queries
  const buildTimeRange = () => {
    const endSeconds = Math.floor(Date.now() / 1000);
    const startSeconds = endSeconds - historyDurationSeconds;
    return {
      range: {
        start: { seconds: startSeconds, nanos: 0 },
        end: { seconds: endSeconds, nanos: 0 }
      }
    };
  };

  // Scenario 1: GetFleetSnapshot - Live aggregate queries
  const fleetSnapshotScenario = scenario("Get Fleet Snapshot")
    .exec(
      grpc("GetFleetSnapshot - No Filter")
        .unary("telemetry.v1.TelemetryService/GetFleetSnapshot")
        .send({
          vehicle_ids: [],
          include_metrics: true
        })
        .check(statusCode().is("OK"))
    )
    .pause(1)
    .exec(
      grpc("GetFleetSnapshot - With Filter")
        .unary("telemetry.v1.TelemetryService/GetFleetSnapshot")
        .send({
          vehicle_ids: ["VEHICLE-001", "VEHICLE-002", "VEHICLE-003"],
          include_metrics: true
        })
        .check(statusCode().is("OK"))
    );

  // Scenario 2: QueryTelemetryHistory - Historical data streaming
  const historyStream1 = grpc("QueryTelemetryHistory - All")
    .serverStream("telemetry.v1.TelemetryService/QueryTelemetryHistory")
    .check(statusCode().is("OK"));

  const historyStream2 = grpc("QueryTelemetryHistory - Single")
    .serverStream("telemetry.v1.TelemetryService/QueryTelemetryHistory")
    .check(statusCode().is("OK"));

  const telemetryHistoryScenario = scenario("Query Telemetry History")
    .exec((session: Session) => {
      const timeRange = buildTimeRange();
      return session.set("timeRange", timeRange.range);
    })
    .exec(
      historyStream1.send((session: Session) => ({
        vehicle_ids: [],
        range: session.get("timeRange"),
        limit: 100
      })),
      historyStream1.awaitStreamEnd()
    )
    .pause(2)
    .exec(
      historyStream2.send((session: Session) => ({
        vehicle_ids: ["VEHICLE-001"],
        range: session.get("timeRange"),
        limit: 50
      })),
      historyStream2.awaitStreamEnd()
    );

  // Scenario 3: GetHistoricalAggregates - Time-bucketed analytics
  const historicalAggregatesScenario = scenario("Get Historical Aggregates")
    .exec((session: Session) => {
      const timeRange = buildTimeRange();
      return session.set("timeRange", timeRange.range);
    })
    .exec(
      grpc("GetHistoricalAggregates - All Metrics")
        .unary("telemetry.v1.TelemetryService/GetHistoricalAggregates")
        .send((session: Session) => ({
          vehicle_ids: [],
          range: session.get("timeRange"),
          window: { seconds: windowSeconds },
          aggregates: [
            "AGGREGATE_TYPE_AVG_SPEED_KMH",
            "AGGREGATE_TYPE_MAX_SPEED_KMH",
            "AGGREGATE_TYPE_TOTAL_DISTANCE_KM",
            "AGGREGATE_TYPE_MIN_FUEL_LEVEL"
          ]
        }))
        .check(statusCode().is("OK"))
    )
    .pause(1)
    .exec(
      grpc("GetHistoricalAggregates - Speed Only")
        .unary("telemetry.v1.TelemetryService/GetHistoricalAggregates")
        .send((session: Session) => ({
          vehicle_ids: ["VEHICLE-001", "VEHICLE-002"],
          range: session.get("timeRange"),
          window: { seconds: windowSeconds },
          aggregates: ["AGGREGATE_TYPE_AVG_SPEED_KMH"]
        }))
        .check(statusCode().is("OK"))
    );

  // Scenario 4: StreamVehicleSnapshots - Real-time streaming
  const vehicleStream = grpc("StreamVehicleSnapshots")
    .serverStream("telemetry.v1.TelemetryService/StreamVehicleSnapshots")
    .check(statusCode().is("OK"));

  const streamSnapshotsScenario = scenario("Stream Vehicle Snapshots").exec(
    vehicleStream.send({
      vehicle_ids: [],
      include_metrics: true
    }),
    vehicleStream.awaitStreamEnd()
  );

  // Load profile selection based on parameter
  const loadProfile = getParameter("loadProfile") || "mixed";

  let setupConfig;

  switch (loadProfile) {
    case "fleet":
      // Heavy fleet snapshot queries
      setupConfig = setUp(
        fleetSnapshotScenario.injectOpen(
          rampUsers(fleetUsers * 2).during(testDurationSeconds)
        )
      );
      break;

    case "history":
      // Heavy historical queries
      setupConfig = setUp(
        telemetryHistoryScenario.injectOpen(
          rampUsers(historyUsers * 2).during(testDurationSeconds)
        )
      );
      break;

    case "stream":
      // Long-lived streaming connections
      setupConfig = setUp(
        streamSnapshotsScenario.injectOpen(atOnceUsers(streamUsers))
      );
      break;

    case "aggregates":
      // Analytics-focused load
      setupConfig = setUp(
        historicalAggregatesScenario.injectOpen(
          rampUsers(aggregateUsers * 2).during(testDurationSeconds)
        )
      );
      break;

    case "smoke":
      // Quick validation test
      setupConfig = setUp(
        fleetSnapshotScenario.injectOpen(atOnceUsers(1)),
        telemetryHistoryScenario.injectOpen(atOnceUsers(1)),
        historicalAggregatesScenario.injectOpen(atOnceUsers(1))
      );
      break;

    case "mixed":
    default:
      // Balanced mix of all scenarios
      setupConfig = setUp(
        fleetSnapshotScenario.injectOpen(
          constantUsersPerSec(fleetUsers / 10).during(testDurationSeconds)
        ),
        telemetryHistoryScenario.injectOpen(
          constantUsersPerSec(historyUsers / 10).during(testDurationSeconds)
        ),
        historicalAggregatesScenario.injectOpen(
          constantUsersPerSec(aggregateUsers / 10).during(testDurationSeconds)
        ),
        streamSnapshotsScenario.injectOpen(atOnceUsers(streamUsers))
      );
  }

  setupConfig.protocols(baseGrpcProtocol);
});
