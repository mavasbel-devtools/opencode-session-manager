import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"

/**
 * Refreshes an admitted fold whose only stale field is the store identity it was admitted under.
 *
 * `admits()` refuses a stored admission when `proof.sourceDigest`, `proof.admissionID` or
 * `proof.summaryDigest` disagree with the checkpoint it names, with one message for all three. Only
 * the first can drift on its own: `sourceDigest` is `foldDigest(hostIdentity())`, and `hostIdentity()`
 * hashed the mount (`${stat.dev}:…`) until `fold-identity-stable`. A digest that differs while the
 * checkpoint and the summary still match is a moved store, not a different fold: this patch keeps
 * the refusal for the other two fields, and on a digest-only mismatch rewrites the admission with the
 * current digest and reports `replay provenance refreshed after the store identity changed`. The fold
 * then reads as admitted again from the next transform on, without waiting for a new turn to rewrite
 * it. Evidence: docs/reference/2026-11-10-23-00-magic-context-fold-identity.md.
 *
 * 0.49.50 (sha512-RYF7ydrf…bJ85g==): the guard occurs once in each of `dist/context-4js5qnnm.js`
 * and `dist/v2/context-qkr7z6d0.js`. `refusal-recovery` changes both files first (its toast), so
 * `before` is that patch's `after`, not the published tarball's file.
 *
 * 0.49.55 (sha512-LqyhQ7hN…SjA7oQ==): `dist/context-vx5gw5h2.js` and `dist/v2/context-13er940g.js`; `refusal-recovery`
 * changes both first, so `before` is that patch's `after`. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.
 *
 * 0.49.56 (sha512-hUfmVxV3…46bEyw==): `dist/context-bejy30t5.js` and `dist/v2/context-5hhm89jw.js`;
 * `refusal-recovery` changes both first, so `before` is that patch's `after`. Evidence:
 * docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md.
 *
 * 0.49.63 (sha512-A4ezV8dr…Lu9A==): `dist/context-aaht09yh.js` and `dist/v2/context-hk9x7ngz.js`;
 * `refusal-recovery` changes both first, so `before` is that patch's `after`. Evidence:
 * docs/reference/2026-11-19-19-04-magic-context-0.49.63-patches.md.
 */

const FIND = `      if (proof.sourceDigest !== foldDigest(reader.hostIdentity()) || proof.admissionID !== cut.id || proof.summaryDigest !== foldDigest(cut.data.summary ?? "")) {
        this.report(sessionID, "replay refused: invalid checkpoint floor or provenance");
        return false;
      }`

const REPLACE = `      const hostDigest = foldDigest(reader.hostIdentity());
      if (proof.admissionID !== cut.id || proof.summaryDigest !== foldDigest(cut.data.summary ?? "")) {
        this.report(sessionID, "replay refused: invalid checkpoint floor or provenance");
        return false;
      }
      if (proof.sourceDigest !== hostDigest) {
        this.report(sessionID, "replay provenance refreshed after the store identity changed");
        saved.proof = { ...proof, sourceDigest: hostDigest };
        const refreshed = encodeAdmissionV3(saved);
        await this.admissions.set(this.admissionKey(sessionID), { payload: refreshed, digest: foldDigest(refreshed) });
      }`

export const foldProvenanceHeal: PatchDefinition = {
  id: "fold-provenance-heal",
  title: "refresh a fold admission whose only stale field is the store identity",
  reason:
    "an admission written under another mount is refused for a digest mismatch it can never repair by itself, so the native fold of every affected session is refused from boot to boot",
  evidence: "docs/reference/2026-11-10-23-00-magic-context-fold-identity.md",
  matcher: {
    directory: "dist",
    extension: ".js",
    // The identity code arrived after 0.49.43: releases without it have nothing to change.
    optional: true,
    sites: [
      {
        name: "admission guard",
        files: 2,
        shapes: [{ find: FIND, replace: REPLACE, count: 1 }],
        anchor: "const proof = saved.proof;",
        window: 300,
      },
    ],
  },
  releases: [
    {
      version: "0.49.50",
      files: [
        {
          path: "dist/context-4js5qnnm.js",
          before: "026a90661806373d5e45281a723990ad0fcc11ebc4f494a9f19d0bdf41b3d4ce",
          after: "0badabe6fdb6f689f66c1a350d7e691420dd07091da9568518c5c149738c29a3",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/context-qkr7z6d0.js",
          before: "6da832951427fc690c7578c18bd3bba0939b243f013846731ce3b5c08b6a1215",
          after: "c2c28efec09d256580a7da247c992e18e80c1fa87f85caee5658fa371cf8902c",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.55",
      files: [
        {
          path: "dist/context-vx5gw5h2.js",
          before: "d8341aa4bec1aa9e4fae20b97c04efb439e64e3e3e7d158008f159a91088bee1",
          after: "d1e7efc3ccd35deb3d76fa33728a1ffdfff1b6ae4767fb239335cc337a744aa8",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/context-13er940g.js",
          before: "eaca32401cee439451748e23315d5fbe081523b610e4b1811fb96163fab15baf",
          after: "e20c0ae7b01925b34c7fdf46dae2c3fe13807ed093c4b025f42cd4e7b0dd5043",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.56",
      files: [
        {
          path: "dist/context-bejy30t5.js",
          before: "e91ed897e2b253ca8694d31ee24fc3503931c00886efb39a1a0c0ffbdd51b2eb",
          after: "09482698aa35629b00c356a0c49c2ba7c082b50bf1738a31709e3744ba0f8eda",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/context-5hhm89jw.js",
          before: "a31e6efde4dc09a8338c734ea1b499cb452f9c921db886801f3f35f3efa3b1dd",
          after: "d27c56b1bdcfe2100aa9f95bf7e9513e1a8a93189908983519440a71741dec8f",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.63",
      files: [
        {
          path: "dist/context-aaht09yh.js",
          before: "53ad471b5aecdad7e2cf07b42c6c52604123d9c9a0f9d6b9ed6b9017cc4f1a66",
          after: "076b55c4429fee14cd07e309add59da2546c443b2164d84bfd6a09e8f7ab6751",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/context-hk9x7ngz.js",
          before: "3e22172353e017f71c9324f6378f66168fd935a092d28a05d4621288cf21e000",
          after: "9633f0d13a4aa72e70e32904f3452cde533914933653eaad12b71c5969682839",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
      ],
    },
  ],
}
