import { OvercardConnectionStatus, OvercardHand, useOvercardPickup } from "@hapa/overcard/react";
import {livingLightTargetFromEntity} from './livingLight.js';
import "./BuilderHeaderHand.css";
import { useState } from "react";

export default function BuilderHeaderHand({ adapter, onOpenLibrary, onOpenManager, onOpenLivingLight }) {
  const {held}=useOvercardPickup(),target=livingLightTargetFromEntity(held?.entity);
  const [dockTarget, setDockTarget] = useState(null);
  const ensureHost = async () => {
    if (globalThis.hapaOvercard?.reconnect) return globalThis.hapaOvercard.reconnect();
    if (globalThis.hapaOvercard?.ensure) return globalThis.hapaOvercard.ensure();
    return undefined;
  };
  return (
    <div ref={setDockTarget} className="builder-header-hand" data-overcard-dock-target="builder-header" aria-label="Shared Hand Header dock">
      <OvercardHand
        surfaceId="hapa-avatar-builder"
        operatorId="calder"
        defaultPresentationMode="docked-minified"
        dockTarget={dockTarget}
        onOpenManager={onOpenManager}
        onOpenLibrary={onOpenLibrary}
      />
      {target&&onOpenLivingLight&&<button type="button" className="builder-header-hand__living-light" onClick={()=>onOpenLivingLight(target)}>Open held Living Light Card</button>}
      <OvercardConnectionStatus adapter={adapter} onEnsureHost={ensureHost} className="builder-header-hand__connection" />
    </div>
  );
}
