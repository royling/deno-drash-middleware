import { CSRF } from "../mod.ts";
import { Drash } from "../../deps.ts";
import { Rhum } from "../../test_deps.ts";

const csrf = CSRF();

/**
 * This resource resembles the following:
 *     1. On any route other than login/register/etc, supply the csrf token on GET requests
 *     2. On requests MADE to the server,  check the token was passed in
 */
class Resource extends Drash.Http.Resource {
  static paths = ["/"];

  public GET() {
    // Give token to the 'view'
    this.response.headers.set("X-CSRF-TOKEN", csrf.token);
    this.response.body = csrf.token;
    return this.response;
  }

  @Drash.Http.Middleware({
    before_request: [csrf],
    after_request: [],
  })
  public POST() {
    // request should have token
    this.response.body = "Success; " + csrf.token;
    return this.response;
  }
}

const server = new Drash.Http.Server({
  resources: [Resource],
});

async function runServer() {
  await server.run({
    hostname: "localhost",
    port: 1337,
  });
}

console.log("Server running");

Rhum.testPlan("CSRF - mod_test.ts", () => {
  Rhum.testSuite("csrf", () => {
    Rhum.testCase("`csrf.token` Should return a valid token", () => {
      Rhum.asserts.assertEquals(
        csrf.token.match("[a-zA-Z0-9]{43}") !== null,
        true,
      );
    });
    Rhum.testCase(
      "Token should be the same for different requests",
      async () => {
        await runServer();
        const firstRes = await fetch("http://localhost:1337");
        await firstRes.arrayBuffer();
        Rhum.asserts.assertEquals(
          firstRes.headers.get("X-CSRF-TOKEN") === csrf.token,
          true,
        );
        const secondRes = await fetch("http://localhost:1337");
        await secondRes.arrayBuffer();
        Rhum.asserts.assertEquals(
          secondRes.headers.get("X-CSRF-TOKEN") === csrf.token,
          true,
        );
        server.close();
      },
    );
    Rhum.testCase("Token can be used for other requests", async () => { // eg get it from a route, and use it in the view for sending other requests
      await runServer();
      const firstRes = await fetch("http://localhost:1337");
      const token = firstRes.headers.get("X-CSRF-TOKEN");
      await firstRes.arrayBuffer();
      const secondRes = await fetch("http://localhost:1337", {
        method: "POST",
        headers: {
          "X-CSRF-TOKEN": token || "", // bypass annoying tsc warnings
        },
      });
      Rhum.asserts.assertEquals(secondRes.status, 200);
      Rhum.asserts.assertEquals(
        await secondRes.text(),
        '"Success; ' + token + '"',
      );
      server.close();
    });
    Rhum.testCase(
      "Route with CSRF should throw a 403 when no token",
      async () => {
        await runServer();
        const res = await fetch("http://localhost:1337", {
          method: "POST",
        });
        Rhum.asserts.assertEquals(res.status, 403);
        Rhum.asserts.assertEquals(
          await res.text(),
          '"No CSRF token was passed in"',
        );
        server.close();
      },
    );
    // This test asserts that the token is consistent when passed about, and will not change
    Rhum.testCase(
      "Route should respond with success when passing in token",
      async () => {
        await runServer();
        const res = await fetch("http://localhost:1337", {
          method: "POST",
          headers: {
            "X-CSRF-TOKEN": csrf.token,
          },
        });
        Rhum.asserts.assertEquals(res.status, 200);
        Rhum.asserts.assertEquals(
          await res.text(),
          '"Success; ' + csrf.token + '"',
        );
        server.close();
      },
    );
  });
});

Rhum.run();