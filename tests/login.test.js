import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

describe("StockPilot Inventory Admin - Authentication Flow", () => {
  it("loads the login page and verifies demo credentials and UI elements", async (context) => {
    const testdriver = TestDriver(context);

    // Target the production environment
    await testdriver.provision.chrome({
      url: "https://stockpilot-inventory-admin.vercel.app",
    });

    // Verify key UI elements on the login page
    const emailField = await testdriver.find("Email input field");
    expect(emailField).toBeDefined();

    const passwordField = await testdriver.find("Password input field");
    expect(passwordField).toBeDefined();

    const signInBtn = await testdriver.find("Sign in button");
    expect(signInBtn).toBeDefined();

    // Verify demo account buttons are displayed
    const adminDemoBtn = await testdriver.find("Admin demo account button");
    expect(adminDemoBtn).toBeDefined();

    // Make an AI-powered assertion verifying the overall page state
    const assertResult = await testdriver.assert(
      "The StockPilot login page is displayed with Welcome back header, email and password inputs, and demo account shortcuts"
    );
    expect(assertResult).toBeTruthy();
  });
});
