import type {PrintTemplateLayout} from "../shared/printTemplateLayout.js";

export function printTemplateVisibleFilter(userId: string) {
    return {$or: [{user_id: userId}, {is_shared: true}]};
}

export function shouldShareNewPrintTemplate(auth: { user: { role?: string } }): boolean {
    return auth.user.role === "admin";
}

export function canMutatePrintTemplate(
    auth: { userId: string; user: { role?: string } },
    template: { user_id?: string; is_shared?: boolean },
): boolean {
    if (String(template.user_id ?? "") === auth.userId) return true;
    return Boolean(template.is_shared) && auth.user.role === "admin";
}

export function stripSignatureImages(layout: PrintTemplateLayout): PrintTemplateLayout {
    return {
        ...layout,
        sections: layout.sections.map((section) => {
            if (section.type !== "signature") return section;
            const {imageSrc: _imageSrc, ...rest} = section;
            return rest;
        }),
    };
}

export function presentPrintTemplate(template: any, viewerUserId: string) {
    const doc = {
        ...template,
        _id: template._id.toString(),
        is_shared: Boolean(template.is_shared),
    };
    return doc;
}
