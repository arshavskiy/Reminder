import express from "express";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";

export function registerFeatureRoutes(app: express.Application) {
  app.get("/api/features", async (req, res) => {
    try {
      await requireAuth(req.headers.cookie ?? undefined);
    } catch {
      res.status(401).json({error: "Unauthorized"});
      return;
    }

    const rows = await col("features")
      .find({})
      .sort({scope: 1, sort_order: 1})
      .toArray();

    res.json({
      rows: rows.map((row: any) => {
        const {_id, ...rest} = row;
        return {id: _id?.toString(), ...rest};
      }),
    });
  });
}
