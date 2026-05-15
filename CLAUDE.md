# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`game-demo` is a 2D browser-based video game built by Claude. The project is in its early stages — no build tooling, framework, or source files exist yet.

## Development Branch

All development happens on feature branches. The `main` branch is the stable branch. Push work to the active feature branch and open a PR rather than pushing directly to `main`.

## Conventions

- Update the `VERSION` constant at the top of `game.js` to the current date/time (`'YYYY-MM-DD HH:MM'`) in every commit that changes game behaviour. This is displayed in-game so the user can verify they have the latest deploy.
