import type { Screen, Connection } from "./types";
import { NODE_WIDTH, NODE_HEIGHT } from "./types";

const baseScreens: Omit<Screen, "x" | "y" | "width" | "height">[] = [
  { id: "onboarding", name: "Onboarding", figmaFrameId: "1:1" },
  { id: "signup", name: "Sign Up", figmaFrameId: "1:2" },
  { id: "login", name: "Login", figmaFrameId: "1:3" },
  { id: "home", name: "Home Dashboard", figmaFrameId: "1:4" },
  { id: "forgot", name: "Forgot Password", figmaFrameId: "1:5" },
  { id: "profile", name: "Profile Setup", figmaFrameId: "1:6" },
];

export const mockScreens: Screen[] = baseScreens.map((s) => ({
  ...s,
  x: 0,
  y: 0,
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
}));

export const mockConnections: Connection[] = [
  {
    id: "c1",
    sourceId: "onboarding",
    destinationId: "signup",
    trigger: "Get Started",
    flowType: "happy",
  },
  {
    id: "c2",
    sourceId: "signup",
    destinationId: "home",
    trigger: "Submit Form",
    flowType: "happy",
  },
  {
    id: "c3",
    sourceId: "onboarding",
    destinationId: "login",
    trigger: "Already have account",
    flowType: "secondary",
  },
  {
    id: "c4",
    sourceId: "login",
    destinationId: "home",
    trigger: "Login Success",
    flowType: "secondary",
  },
  {
    id: "c5",
    sourceId: "login",
    destinationId: "forgot",
    trigger: "Forgot Password?",
    flowType: "secondary",
  },
  {
    id: "c6",
    sourceId: "signup",
    destinationId: "profile",
    trigger: "Complete Profile",
    flowType: "skip",
  },
  {
    id: "c7",
    sourceId: "profile",
    destinationId: "home",
    trigger: "Save & Continue",
    flowType: "skip",
  },
];