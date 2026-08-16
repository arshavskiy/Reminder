import {col} from "../db/db.js";
import {ObjectId} from "mongodb";
import {GENERATED_PRINT_TEMPLATE_PDF, groupGeneratedPdfsToCollapse} from "./generatedPdfReplace.js";
import {logger} from "../logger.js";

export async function collapseDuplicateGeneratedPdfs(): Promise<{ deleted: number }> {
    const docs = await col("documents").find({
        $or: [
            {document_kind: GENERATED_PRINT_TEMPLATE_PDF},
            {document_source: "generated"},
        ],
    }).project({
        user_id: 1,
        contract_id: 1,
        extracted_fields: 1,
        file_name: 1,
        created_at: 1,
        updated_at: 1,
    }).toArray();

    const preferredIds = (await col("contracts").find(
        {document_id: {$type: "string", $ne: ""}},
        {projection: {document_id: 1}},
    ).toArray())
        .map((contract: any) => String(contract.document_id))
        .filter(Boolean);

    const groups = groupGeneratedPdfsToCollapse(
        docs.map((doc: any) => ({
            id: String(doc._id),
            user_id: doc.user_id,
            contract_id: doc.contract_id,
            extracted_fields: doc.extracted_fields,
            file_name: doc.file_name,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
        })),
        preferredIds,
    );

    const deleteIds = groups.flatMap((group) => group.deleteIds);
    if (!deleteIds.length) return {deleted: 0};

    const objectIds = deleteIds.map((id) => {
        try {
            return new ObjectId(id);
        } catch {
            return id;
        }
    });
    const result = await col("documents").deleteMany({_id: {$in: objectIds} as any});

    for (const group of groups) {
        await col("contracts").updateMany(
            {document_id: {$in: group.deleteIds}},
            {$set: {document_id: group.keepId, updated_at: new Date()}},
        );
    }

    logger.info("collapsed_duplicate_generated_pdfs", {
        groups: groups.length,
        deleted: result.deletedCount ?? 0,
    });
    return {deleted: result.deletedCount ?? 0};
}
