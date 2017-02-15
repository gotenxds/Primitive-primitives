"use strict";

import 'jest';
require("babel-core/register");
require("babel-polyfill");

import { EllipsePrimitive } from "./EllipsePrimitive";

describe("Example", () => {
    it("Should be pass sanity", () => {
        expect(typeof EllipsePrimitive).toBe("function");
    });
});
