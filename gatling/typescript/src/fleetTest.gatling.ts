import { simulation, scenario, atOnceUsers } from "@gatling.io/core";
import { grpc, statusCode } from "@gatling.io/grpc";

export default simulation((setUp) => {
  const telemetryServer = grpc
    .serverConfiguration("telemetry")
    .forAddress("127.0.0.1", 50051)
    .usePlaintext();

  const testProtocol = grpc.serverConfigurations(telemetryServer);

  const fleetScenario = scenario("Fleet Test")
    .exec(
      grpc("GetFleetSnapshot")
        .unary("telemetry.v1.TelemetryService/GetFleetSnapshot")
        .send({ vehicle_ids: [], include_metrics: true })
        .check(statusCode().is("OK"))
    )
    .exec(
      grpc("GetFleetSnapshot Again")
        .unary("telemetry.v1.TelemetryService/GetFleetSnapshot")
        .send({ vehicle_ids: [], include_metrics: false })
        .check(statusCode().is("OK"))
    );

  setUp(fleetScenario.injectOpen(atOnceUsers(2))).protocols(testProtocol);
});
