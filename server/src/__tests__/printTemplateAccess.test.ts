import {describe, expect, it} from "vitest";
import {
  canMutatePrintTemplate,
  presentPrintTemplate,
  printTemplateVisibleFilter,
  shouldShareNewPrintTemplate,
  stripSignatureImages,
} from "../templates/printTemplateAccess.js";
import {createDefaultPrintTemplateLayout} from "../shared/printTemplateLayout.js";

const admin = {userId: "admin-1", user: {role: "admin"}};
const owner = {userId: "6a10a0e0453ac80348bb04b3", user: {role: "admin"}};
const other = {userId: "other-user", user: {role: "user"}};

describe("printTemplateVisibleFilter", () => {
    it("includes the viewer's own templates and shared ones", () => {
        expect(printTemplateVisibleFilter("u1")).toEqual({
            $or: [{user_id: "u1"}, {is_shared: true}],
        });
    });
});

describe("shouldShareNewPrintTemplate", () => {
    it("shares templates created by an admin", () => {
        expect(shouldShareNewPrintTemplate(admin)).toBe(true);
    });

    it("does not share templates created by a regular user", () => {
        expect(shouldShareNewPrintTemplate(other)).toBe(false);
    });
});

describe("canMutatePrintTemplate", () => {
    it("lets the owner edit their template", () => {
        expect(canMutatePrintTemplate(owner, {user_id: owner.userId, is_shared: true})).toBe(true);
    });

    it("lets an admin edit a shared template they do not own", () => {
        expect(canMutatePrintTemplate(admin, {user_id: owner.userId, is_shared: true})).toBe(true);
    });

    it("blocks a regular user from editing a shared template", () => {
        expect(canMutatePrintTemplate(other, {user_id: owner.userId, is_shared: true})).toBe(false);
    });

    it("lets a regular user edit their own private template", () => {
        expect(canMutatePrintTemplate(other, {user_id: other.userId, is_shared: false})).toBe(true);
    });
});

describe("presentPrintTemplate", () => {
    it("strips the owner's signature image for other users", () => {
        const layout = createDefaultPrintTemplateLayout();
        const sig = layout.sections.find((s) => s.type === "signature");
        if (sig && sig.type === "signature") sig.imageSrc = "https://example.com/sig.jpg";
        const presented = presentPrintTemplate(
            {_id: {toString: () => "abc"}, user_id: owner.userId, is_shared: true, layout},
            other.userId,
        );
        const presentedSig = presented.layout.sections.find((s: { type: string }) => s.type === "signature");
        expect(presentedSig.imageSrc).toBeUndefined();
    });

    it("keeps the signature image for the owner", () => {
        const layout = stripSignatureImages(createDefaultPrintTemplateLayout());
        const withSig = {
            ...layout,
            sections: layout.sections.map((section) =>
                section.type === "signature" ? {...section, imageSrc: "https://example.com/sig.jpg"} : section,
            ),
        };
        const presented = presentPrintTemplate(
            {_id: {toString: () => "abc"}, user_id: owner.userId, is_shared: true, layout: withSig},
            owner.userId,
        );
        const presentedSig = presented.layout.sections.find((s: { type: string }) => s.type === "signature");
        expect(presentedSig.imageSrc).toBe("https://example.com/sig.jpg");
    });
});
