# Super Intelligence (SI) Use Disclosure

**Project:** Interfellas / Lunaspis
**Last updated:** 2026-11-15

This document records where and how Super Intelligence (SI) tools were used in
this project, as required by the NASA Space Apps Challenge SI policy.

## Tools used

- **Coding assistant / large language model:** OpenCode coding agent running used for code drafting, review, refactoring, debugging,
  documentation, test fixtures, and procedural asset-generation scripts.
- **No image-generation model** was used for any NASA-branded image, logo,
  flag, or agency insignia. No NASA logo, flag, or agency-insignia artwork is
  intentionally included in the runtime build. The generated ISS rack atlas
  carries a visible **SI-GENERATED** watermark; see the media inventory below.

## Scope of SI assistance

| Area                                                                            | SI involvement                                                                                                                                                                                                                                                                                               | Human review                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Server and client code (`server.js`, `server/`, `public/js/`)                   | Drafting, refactoring, debugging, and test scaffolding                                                                                                                                                                                                                                                       | Reviewed and exercised by the team; automated checks in `tests/`           |
| Tests (`tests/`)                                                                | Drafting and updating check scripts                                                                                                                                                                                                                                                                          | Reviewed and run by the team                                               |
| Documentation (`README.md`, `docs/`, asset READMEs)                             | Drafting and editing                                                                                                                                                                                                                                                                                         | Reviewed by the team                                                       |
| Procedural 3D asset scripts (`scripts/crew/build_crew.py`, Blender/GLB tooling) | Authoring and editing the scripts that generate geometry, rigs, and renders                                                                                                                                                                                                                                  | Renders inspected; the crew uniforms were rebuilt without agency wordmarks |
| Procedural textures and environments (`public/js/world/`)                       | Canvas-drawn signs, decals, and scene dressing code                                                                                                                                                                                                                                                          | Rendered and inspected in the 3D scene                                     |
| Audio                                                                           | Web Audio synthesis and radio-tone code; no SI-generated audio files                                                                                                                                                                                                                                         | Reviewed by the team                                                       |
| Images and videos                                                               | The generated ISS rack atlas (`public/textures/iss/payload_racks_v1.png`) carries a visible **SI-GENERATED** watermark. Preview renders in `scripts/crew/previews/` are deterministic Blender renders of procedural geometry and carry an **SI-ASSISTED RENDER** label; they are not image-generation output | Reviewed by the team                                                       |

## Media marking policy

- **Images and videos:** Any SI-generated image or video added to this project
  must include a visible watermark reading **SI-GENERATED** (or **SI**). The
  generated ISS rack atlas is watermarked on each quadrant.
- **Audio:** Any SI-generated audio added to this project must be acknowledged
  in descriptive text, file metadata, and this document. The current build uses
  procedural Web Audio synthesis and contains no SI-generated audio files.
- **Code and data:** Code and data files that were substantially SI-assisted
  carry an `SI-ASSISTED` note in their header comments where practical. This
  document is the project-level acknowledgement for the repository.

## NASA branding compliance

NASA logos, flags, insignia, and wordmarks were removed from the runtime 3D
scenes and crew uniforms:

- The VAB meatball graphic was replaced with an original Lunaspis emblem.
- NASA flag banners were replaced with U.S. flag banners.
- NASA vehicle, crawler, rover, and building decals were replaced with original
  Lunaspis or neutral facility labels.
- The white NASA wordmarks and red swoosh were removed from the crew jersey
  geometry, and the crew models and preview renders were regenerated.
- The NASA meatball baked into the ISS texture atlas was removed by inpainting.
- The design-reference Godot project no longer draws a NASA meatball or
  wordmark.

Remaining occurrences of the word "NASA" in the repository are factual
references, source attributions, or links to public NASA resources. They are
not logos, flags, or agency design elements.

## Before submission

If any new SI-generated image, video, audio, or dataset is added, update this
file and add the required visible watermark or metadata acknowledgement before
publishing the project.
