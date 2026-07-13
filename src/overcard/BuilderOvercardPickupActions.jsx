import { OvercardPickupActions } from "@hapa/overcard/react";
import { builderEntityRef } from "./pickup.js";
export default function BuilderOvercardPickupActions({ entity, readOnly = false, className = "" }) { return <OvercardPickupActions entity={builderEntityRef(entity)} surfaceId="hapa-avatar-builder" actor="calder" readOnly={readOnly} className={className} />; }
