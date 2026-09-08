import { readFileSync } from "node:fs";
import path from "node:path";
import { buildWqpResult, WQP_ADAPTER, WQP_SOURCE, WQP_VERSION } from "@/lib/research/wqp-field-positive-review";
import type { ResearchSourceAdapter } from "@/lib/research/source-adapter";
export const wqpFieldCountsAdapter:ResearchSourceAdapter={adapterId:WQP_ADAPTER,adapterVersion:WQP_VERSION,sourceId:WQP_SOURCE,
  async run(context){const result=buildWqpResult(context,p=>readFileSync(path.join(process.cwd(),p)));return {...result,completedAt:new Date().toISOString()};}};

import { buildWqpFishResult, WQP_FISH_VERSION } from "@/lib/research/wqp-fish-positive-review";
export const wqpFishMeasurementsAdapter:ResearchSourceAdapter={adapterId:WQP_ADAPTER,adapterVersion:WQP_FISH_VERSION,sourceId:WQP_SOURCE,
  async run(context){const result=buildWqpFishResult(context,p=>readFileSync(path.join(process.cwd(),p)));return {...result,completedAt:new Date().toISOString()};}};

import { buildWqpReviewedFishResult, WQP_REVIEWED_FISH_VERSION } from "@/lib/research/wqp-reviewed-fish";
export const wqpReviewedFishAdapter:ResearchSourceAdapter={adapterId:WQP_ADAPTER,adapterVersion:WQP_REVIEWED_FISH_VERSION,sourceId:WQP_SOURCE,
  async run(context){const result=buildWqpReviewedFishResult(context,p=>readFileSync(path.join(process.cwd(),p)));return {...result,completedAt:new Date().toISOString()};}};
