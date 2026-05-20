import assert from "node:assert/strict";
import test from "node:test";

import {
  Clapperboard,
  CircleDollarSign,
  Clock3,
  Film,
  Images,
  MessageSquare,
  ScrollText,
} from "lucide-react";

import { resolveNextActionNavIcon } from "./next-action-nav";

test("resolveNextActionNavIcon maps workflow destinations", () => {
  assert.equal(
    resolveNextActionNavIcon("/videos/v1/storyboard"),
    ScrollText,
  );
  assert.equal(
    resolveNextActionNavIcon("/videos/v1/references"),
    Images,
  );
  assert.equal(
    resolveNextActionNavIcon("/videos/v1/segments"),
    Clapperboard,
  );
  assert.equal(
    resolveNextActionNavIcon("/videos/v1/assembly"),
    Film,
  );
  assert.equal(
    resolveNextActionNavIcon("/videos/v1/costs"),
    CircleDollarSign,
  );
});

test("resolveNextActionNavIcon uses clock when navigation is unavailable", () => {
  assert.equal(resolveNextActionNavIcon(null), Clock3);
});

test("resolveNextActionNavIcon uses message icon for project overview links", () => {
  assert.equal(resolveNextActionNavIcon("/videos/v1"), MessageSquare);
});
