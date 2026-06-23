const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.SMOKE_URL || "http://127.0.0.1:8787";
const errors = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop/.test(message)) {
      errors.push(message);
    }
  });

  try {
    await win.loadURL(targetUrl);
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        if (document.readyState === "complete") resolve();
        else window.addEventListener("load", resolve, { once: true });
      })
    `);
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const hydrated = document.body.innerText.includes("API\\nAPI")
            || document.querySelector(".slot.filled .asset-image")
            || Date.now() - started > 5000;
          if (hydrated) resolve();
          else setTimeout(tick, 120);
        };
        tick();
      })
    `);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const packReady = document.querySelector(".attach-panel pre")?.textContent.includes("hapa.avatar-attach-pack.v1")
            || Date.now() - started > 2000;
          if (packReady) resolve();
          else setTimeout(tick, 120);
        };
        tick();
      })
    `);
    const threeInitiallyMounted = await win.webContents.executeJavaScript(`
      Boolean(document.querySelector(".three-avatar-viewer"))
    `);
    const threeGateReady = await win.webContents.executeJavaScript(`
      Boolean(document.querySelector(".three-viewer-gate"))
    `);
    const threeLoadClicked = await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll("button")].find((item) => /load 3d viewer/i.test(item.textContent || ""));
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()
    `);
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const defaultClipUi = document.querySelector(".three-default-readout")
            || Date.now() - started > 5000;
          if (defaultClipUi) resolve();
          else setTimeout(tick, 120);
        };
        tick();
      })
    `);

    const metrics = await win.webContents.executeJavaScript(`
      ({
        title: document.querySelector("h1")?.textContent || "",
        bucketPanels: document.querySelectorAll(".bucket-panel").length,
        mediaTiles: document.querySelectorAll(".media-tile").length,
        avatarRows: document.querySelectorAll(".avatar-row").length,
        avatarRowPortrait: Boolean(document.querySelector(".avatar-row .avatar-orb.has-portrait .asset-image")),
        avatarCorePortrait: Boolean(document.querySelector(".avatar-core.has-portrait .avatar-core-portrait .asset-image")),
        identityEditor: Boolean(document.querySelector(".identity-panel input") && [...document.querySelectorAll(".identity-panel button")].some((button) => /save identity/i.test(button.textContent || ""))),
        emptySlots: document.querySelectorAll(".slot:not(.filled)").length,
        sectionHeroes: document.querySelectorAll(".section-hero").length,
        defaultChips: document.querySelectorAll(".default-chip, .slot-order").length,
        canonicalImageLabels: /character-dossier-image-1|kit-poses-image-1|full-body/.test(document.body.textContent || ""),
        draggableSlots: document.querySelectorAll(".slot[draggable='true']").length,
        expandButtons: document.querySelectorAll(".expand-button").length,
        thumbnailCount: document.querySelectorAll(".asset-thumb").length,
        avatarModelPanel: Boolean(document.querySelector(".avatar-model-panel")),
        threeInitiallyMounted: ${JSON.stringify(threeInitiallyMounted)},
        threeGateReady: ${JSON.stringify(threeGateReady)},
        threeLoadClicked: ${JSON.stringify(threeLoadClicked)},
        threeViewer: Boolean(document.querySelector(".three-avatar-viewer")),
        threeCameraToggle: [...document.querySelectorAll(".three-controls button")].some((button) => /cinematic|profile/i.test(button.textContent || "")),
        threeDefaultClipButton: [...document.querySelectorAll(".three-controls button")].some((button) => /set default|default/i.test(button.textContent || "")),
        threeDefaultReadout: document.querySelector(".three-default-readout")?.textContent || "",
        rigCardLayout: (() => {
          const panel = document.querySelector(".avatar-model-panel");
          const drop = document.querySelector(".model-drop-zone");
          const rail = document.querySelector(".model-asset-list");
          const card = document.querySelector(".model-asset-row");
          if (!panel || !drop || !rail || !card) return { ok: false, reason: "missing rig layout nodes" };
          const rect = (node) => {
            const box = node.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
          };
          const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const panelRect = rect(panel);
          const dropRect = rect(drop);
          const railRect = rect(rail);
          const cardRect = rect(card);
          const dropCardOverlap = intersects(dropRect, cardRect);
          const railEscapesPanel = railRect.left < panelRect.left - 1 || railRect.right > panelRect.right + 1;
          const cardEscapesRail = cardRect.left < railRect.left - 1 || cardRect.right > railRect.right + 1;
          return {
            ok: !dropCardOverlap && !railEscapesPanel && !cardEscapesRail,
            dropCardOverlap,
            railEscapesPanel,
            cardEscapesRail,
            panelRect,
            dropRect,
            railRect,
            cardRect
          };
        })(),
        threeCameraMode: document.querySelector(".three-avatar-viewer")?.getAttribute("data-camera-mode") || "",
        threeStageTall: (() => {
          const rect = document.querySelector(".three-stage")?.getBoundingClientRect();
          return rect ? rect.height > rect.width : false;
        })(),
        directionPanel: Boolean(document.querySelector(".direction-panel")),
        directionControls: document.querySelectorAll(".direction-control").length,
        intakeEmpty: Boolean(document.querySelector(".intake-empty")),
        dummyIntake: /Sidearm item|Boots item|Field pack item|Happy close-up|Sad close-up/.test(document.querySelector(".intake-panel")?.innerText || ""),
        localPicker: document.querySelector(".local-picker")?.textContent || "",
        dropImport: document.querySelector(".drop-import")?.textContent || "",
        attachPack: document.querySelector(".attach-panel pre")?.textContent.includes("hapa.avatar-attach-pack.v1") || false,
        bodyText: document.body.innerText.slice(0, 500)
      })
    `);

    const rigPanelImage = await win.capturePage();
    const rigPanelScreenshotPath = path.join(ROOT, "artifacts/smoke/avatar-builder-rig-panel.png");
    await fs.mkdir(path.dirname(rigPanelScreenshotPath), { recursive: true });
    await fs.writeFile(rigPanelScreenshotPath, rigPanelImage.toPNG());

    const hoverPreviewOpened = await win.webContents.executeJavaScript(`
      (async () => {
        const thumb = document.querySelector(".slot.filled .asset-thumb, .media-tile .asset-thumb");
        if (!thumb) return false;
        thumb.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, clientX: 520, clientY: 260 }));
        thumb.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, clientX: 520, clientY: 260 }));
        thumb.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 520, clientY: 260 }));
        thumb.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 540, clientY: 280 }));
        await new Promise((resolve) => setTimeout(resolve, 120));
        return Boolean(document.querySelector(".hover-preview-card"));
      })()
    `);

    const workflowViewsOpened = await win.webContents.executeJavaScript(`
      (async () => {
        const tabByText = (pattern) => [...document.querySelectorAll(".view-tabs button")].find((button) => pattern.test(button.textContent || ""));
        const scenesTab = tabByText(/scenes/i);
        const loopsTab = tabByText(/loops/i);
        const lookbookTab = tabByText(/look book/i);
        const builderTab = tabByText(/builder/i);
        const result = {
          scenesTab: Boolean(scenesTab),
          scenesView: false,
          placeEditor: false,
          sceneTimeline: false,
          sceneCasting: false,
          sceneMediaBuckets: 0,
          scenePlaylist: false,
          sceneAttachPack: false,
          loopsTab: Boolean(loopsTab),
          lookbookTab: Boolean(lookbookTab),
          loopsView: false,
          seedFilterWorked: false,
          reverseLoopLab: false,
          visualFrameConnector: false,
          visualFrameConnectorVisible: false,
          connectorTargets: 0,
          lookbookView: false,
          lookbookSpread: false,
          loopListVideoElements: null,
          readerMode: false,
          readerChromeHidden: false,
          readerNodePanelHidden: false
        };
        if (scenesTab) {
          scenesTab.click();
          await new Promise((resolve) => setTimeout(resolve, 1100));
          result.scenesView = Boolean(document.querySelector(".scenes-workflow-view"));
          result.placeEditor = Boolean(document.querySelector(".place-editor input") && document.querySelector(".place-editor textarea"));
          result.sceneTimeline = Boolean(document.querySelector(".scene-timeline-band") && /Canonical Timeline/i.test(document.querySelector(".scene-timeline-band")?.textContent || ""));
          result.sceneCasting = Boolean(document.querySelector(".scene-casting-panel .scene-avatar-chip"));
          result.sceneMediaBuckets = document.querySelectorAll(".scene-media-bucket").length;
          result.scenePlaylist = Boolean(document.querySelector(".scene-playlist-panel .playlist-form"));
          result.sceneAttachPack = document.querySelector(".scene-attach-panel pre")?.textContent.includes("hapa.scene-attach-pack.v1") || false;
        }
        if (loopsTab) {
          loopsTab.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          result.loopsView = Boolean(document.querySelector(".loops-view .loop-detail-panel"));
          const rowsBefore = document.querySelectorAll(".loop-video-row").length;
          const seedList = document.querySelector(".loop-seed-list");
          if (seedList) seedList.scrollTop = seedList.scrollHeight;
          const seededRows = [...document.querySelectorAll(".loop-seed-row")].filter((row) => Number(row.dataset.branchCount || 0) > 0);
          const seededRow = seededRows[seededRows.length - 1];
          seededRow?.click();
          await new Promise((resolve) => setTimeout(resolve, 220));
          const rowsAfter = document.querySelectorAll(".loop-video-row").length;
          const filterChip = document.querySelector(".loop-filter-chip");
          result.seedFilterWorked = Boolean(filterChip) && rowsAfter > 0 && rowsAfter <= rowsBefore;
          result.reverseLoopLab = Boolean(document.querySelector(".reverse-loop-panel .reverse-loop-preview video"));
          result.visualFrameConnector = Boolean(document.querySelector(".frame-connector-panel .connector-frame-card") && document.querySelector(".frame-connector-panel .connector-target-card"));
          result.connectorTargets = document.querySelectorAll(".connector-target-card").length;
          const connector = document.querySelector(".frame-connector-panel");
          const sourceCard = document.querySelector(".frame-connector-panel .connector-frame-card");
          const targetCards = [...document.querySelectorAll(".frame-connector-panel .connector-target-card")];
          const targetCard = targetCards.find((card) => {
            const rect = card.getBoundingClientRect();
            return rect.top >= 78 && rect.bottom <= window.innerHeight - 24;
          }) || targetCards[0];
          if (connector && sourceCard && targetCard) {
            const connectorRect = connector.getBoundingClientRect();
            const sourceRect = sourceCard.getBoundingClientRect();
            const targetRect = targetCard.getBoundingClientRect();
            result.visualFrameConnectorVisible = connectorRect.bottom >= 120
              && sourceRect.bottom > 0
              && targetRect.bottom <= window.innerHeight - 24;
          }
          result.loopListVideoElements = document.querySelectorAll(".loop-video-list video, .loop-seed-list video").length;
        }
        if (lookbookTab) {
          lookbookTab.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          result.lookbookView = Boolean(document.querySelector(".lookbook-view"));
          result.lookbookSpread = document.querySelectorAll(".lookbook-page").length >= 2;
          document.querySelector(".reader-toggle")?.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          result.readerMode = Boolean(document.querySelector(".app-shell.reader-mode-active .lookbook-view.reader-mode"));
          const topbar = document.querySelector(".topbar");
          const sidebar = document.querySelector(".sidebar");
          result.readerChromeHidden = (!topbar || getComputedStyle(topbar).display === "none")
            && (!sidebar || getComputedStyle(sidebar).display === "none");
          const nodePanel = document.querySelector(".lookbook-node-panel");
          result.readerNodePanelHidden = !nodePanel || getComputedStyle(nodePanel).display === "none";
          document.querySelector(".reader-toggle")?.click();
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        builderTab?.click();
        await new Promise((resolve) => setTimeout(resolve, 180));
        return result;
      })()
    `);

    await win.webContents.executeJavaScript(`
      (async () => {
        const tabByText = (pattern) => [...document.querySelectorAll(".view-tabs button")].find((button) => pattern.test(button.textContent || ""));
        tabByText(/loops/i)?.click();
        await new Promise((resolve) => setTimeout(resolve, 220));
        const seedList = document.querySelector(".loop-seed-list");
        if (seedList) seedList.scrollTop = seedList.scrollHeight;
        const seededRows = [...document.querySelectorAll(".loop-seed-row")].filter((row) => Number(row.dataset.branchCount || 0) > 0);
        const seededRow = seededRows[seededRows.length - 1];
        seededRow?.click();
        await new Promise((resolve) => setTimeout(resolve, 260));
      })()
    `);
    const loopsImage = await win.capturePage();
    const loopsScreenshotPath = path.join(ROOT, "artifacts/smoke/avatar-builder-loops-filter-connector.png");
    await fs.writeFile(loopsScreenshotPath, loopsImage.toPNG());
    await win.webContents.executeJavaScript(`
      (async () => {
        const builderTab = [...document.querySelectorAll(".view-tabs button")].find((button) => /builder/i.test(button.textContent || ""));
        builderTab?.click();
        await new Promise((resolve) => setTimeout(resolve, 180));
      })()
    `);

    const videoBranchUiOpened = await win.webContents.executeJavaScript(`
      (async () => {
        const imageSlot = [...document.querySelectorAll(".slot.filled")].find((slot) => slot.querySelector(".asset-image"));
        if (!imageSlot) return false;
        imageSlot.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
        return Boolean(document.querySelector(".video-branch-panel .video-drop-zone"));
      })()
    `);

    const selectionDetailVisible = await win.webContents.executeJavaScript(`
      (async () => {
        const stage = document.querySelector(".bucket-stage");
        const inspector = document.querySelector(".inspector");
        const panel = [...document.querySelectorAll(".bucket-panel")].find((item) => /2\\/3rds/i.test(item.querySelector("header h3")?.textContent || ""));
        if (!stage || !inspector || !panel) return { ok: false, reason: "missing stage, inspector, or 2/3rds panel" };
        panel.scrollIntoView({ block: "center", inline: "nearest" });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const target = panel.querySelector(".slot.filled, .section-hero");
        if (!target) return { ok: false, reason: "missing selectable 2/3rds asset" };
        inspector.scrollTop = inspector.scrollHeight;
        target.click();
        await new Promise((resolve) => setTimeout(resolve, 180));
        const preview = inspector.querySelector(".asset-preview-large");
        const dock = panel.querySelector(".section-selection-dock");
        if (!preview) return { ok: false, reason: "missing selected asset preview" };
        if (!dock) return { ok: false, reason: "missing same-section selected asset dock" };
        const previewRect = preview.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        const inspectorRect = inspector.getBoundingClientRect();
        const forcedSpacer = document.createElement("div");
        forcedSpacer.setAttribute("data-smoke-scroll-spacer", "true");
        forcedSpacer.style.cssText = "height: 1800px; pointer-events: none;";
        document.body.appendChild(forcedSpacer);
        document.documentElement.style.overflowY = "auto";
        document.body.style.overflowY = "auto";
        window.scrollTo(0, 900);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const pinnedInspectorRect = inspector.getBoundingClientRect();
        const pinnedPreviewRect = preview.getBoundingClientRect();
        const inspectorPosition = getComputedStyle(inspector).position;
        forcedSpacer.remove();
        document.documentElement.style.overflowY = "";
        document.body.style.overflowY = "";
        window.scrollTo(0, 0);
        const visibleTop = Math.max(0, inspectorRect.top);
        const visibleBottom = Math.min(window.innerHeight, inspectorRect.bottom);
        const previewVisible = previewRect.top >= visibleTop - 1 && previewRect.top < visibleBottom - 40;
        const previewPinnedAfterDocumentScroll = pinnedPreviewRect.top >= 70 && pinnedPreviewRect.top < Math.min(window.innerHeight - 80, 170);
        const dockVisible = dockRect.bottom > 78 && dockRect.top < window.innerHeight - 80;
        const dockMatched = /Backgroundless 2\\/3rds Shots|backgroundless-2-3rds/i.test(dock.textContent || "");
        const sectionMatched = /Backgroundless 2\\/3rds Shots/i.test(preview.textContent || "");
        return {
          ok: previewVisible && previewPinnedAfterDocumentScroll && inspectorPosition === "fixed" && sectionMatched && dockVisible && dockMatched && inspector.scrollTop < 8,
          previewVisible,
          previewPinnedAfterDocumentScroll,
          inspectorPosition,
          dockVisible,
          dockMatched,
          sectionMatched,
          inspectorScrollTop: inspector.scrollTop,
          previewTop: previewRect.top,
          pinnedPreviewTop: pinnedPreviewRect.top,
          pinnedInspectorTop: pinnedInspectorRect.top,
          dockTop: dockRect.top,
          inspectorTop: inspectorRect.top,
          stageScrollTop: stage.scrollTop
        };
      })()
    `);

    const modalOpened = await win.webContents.executeJavaScript(`
      (async () => {
        const imageSlot = [...document.querySelectorAll(".slot.filled")].find((slot) => slot.querySelector(".asset-image"));
        const imageTile = [...document.querySelectorAll(".media-tile")].find((tile) => tile.querySelector(".asset-image"));
        const button = imageSlot?.querySelector(".expand-button") || imageTile?.querySelector(".expand-button") || document.querySelector(".slot.filled .expand-button, .media-tile .expand-button");
        if (!button) return false;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
        return Boolean(document.querySelector(".asset-modal"));
      })()
    `);

    const image = await win.capturePage();
    const screenshotPath = path.join(ROOT, "artifacts/smoke/avatar-builder.png");
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, image.toPNG());

    const failures = [];
    if (!/Hapa Avatar Builder/.test(metrics.title)) failures.push("missing title");
    if (metrics.bucketPanels !== 9) failures.push(`expected 9 bucket panels, got ${metrics.bucketPanels}`);
    if (metrics.mediaTiles !== 0) failures.push(`expected empty media intake, got ${metrics.mediaTiles} tiles`);
    if (!metrics.intakeEmpty) failures.push("missing empty media intake state");
    if (metrics.dummyIntake) failures.push("dummy intake media returned");
    if (metrics.avatarRows < 1) failures.push("missing avatar rows");
    if (!metrics.avatarRowPortrait) failures.push("avatar row is not using the default close-up portrait");
    if (!metrics.avatarCorePortrait) failures.push("avatar level panel is not using the default close-up portrait");
    if (!metrics.identityEditor) failures.push("missing avatar identity rename editor");
    if (metrics.emptySlots !== 0) failures.push(`expected no empty placeholder slots, got ${metrics.emptySlots}`);
    if (metrics.sectionHeroes < 1) failures.push("missing section hero/default cards");
    if (metrics.defaultChips < 1) failures.push("missing default/order indicators");
    if (!metrics.canonicalImageLabels) failures.push("missing section-image-number labels");
    if (metrics.draggableSlots < 1) failures.push("filled slots are not draggable");
    if (metrics.expandButtons < 1) failures.push("missing expand controls");
    if (metrics.thumbnailCount < 1) failures.push("missing thumbnail wrappers");
    if (!metrics.avatarModelPanel) failures.push("missing 3D avatar model panel");
    if (metrics.threeInitiallyMounted) failures.push("3D avatar viewer mounted before explicit load");
    if (!metrics.threeGateReady) failures.push("missing unloaded 3D viewer gate");
    if (!metrics.threeLoadClicked) failures.push("could not click Load 3D Viewer control");
    if (!metrics.threeViewer) failures.push("missing 3D avatar viewer after explicit load");
    if (!metrics.threeCameraToggle) failures.push("missing cinematic/profile camera toggle");
    if (!metrics.threeDefaultClipButton) failures.push("missing default animation control");
    if (!/Default animation/i.test(metrics.threeDefaultReadout)) failures.push("missing default animation readout");
    if (!metrics.rigCardLayout.ok) failures.push(`rig card layout overlaps controls: ${JSON.stringify(metrics.rigCardLayout)}`);
    if (metrics.threeCameraMode !== "profile") failures.push(`expected profile camera default, got ${metrics.threeCameraMode}`);
    if (!metrics.threeStageTall) failures.push("3D stage is not vertical/tall");
    if (metrics.directionPanel && metrics.directionControls !== 3) failures.push(`expected 3 direction controls, got ${metrics.directionControls}`);
    if (!hoverPreviewOpened) failures.push("hover preview card did not open");
    if (!modalOpened) failures.push("image detail modal did not open");
    if (!/Preview Local Media/.test(metrics.localPicker)) failures.push("missing local media picker");
    if (!/Drop media to preview/.test(metrics.dropImport)) failures.push("missing local media drop preview target");
    if (!videoBranchUiOpened) failures.push("video branch panel did not open for selected image state");
    if (!selectionDetailVisible.ok) failures.push(`selection detail was not immediately visible: ${JSON.stringify(selectionDetailVisible)}`);
    if (!metrics.attachPack) failures.push("missing attach pack JSON");
    if (!workflowViewsOpened.loopsTab) failures.push("missing Loops tab");
    if (!workflowViewsOpened.lookbookTab) failures.push("missing Look Book tab");
    if (!workflowViewsOpened.scenesTab) failures.push("missing Scenes tab");
    if (!workflowViewsOpened.scenesView || !workflowViewsOpened.placeEditor || !workflowViewsOpened.sceneTimeline) failures.push(`Scenes workflow did not open core editors: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.sceneCasting) failures.push(`Scenes avatar tagging/casting panel missing: ${JSON.stringify(workflowViewsOpened)}`);
    if (workflowViewsOpened.sceneMediaBuckets !== 4) failures.push(`Expected 4 scene media buckets, got ${workflowViewsOpened.sceneMediaBuckets}: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.scenePlaylist || !workflowViewsOpened.sceneAttachPack) failures.push(`Scenes playlist or attach pack missing: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.loopsView) failures.push(`Loops view did not open: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.seedFilterWorked) failures.push(`Seed filter did not narrow route clips: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.reverseLoopLab) failures.push(`Reverse loop lab missing: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.visualFrameConnector || workflowViewsOpened.connectorTargets < 1) failures.push(`Visual frame connector missing targets: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.visualFrameConnectorVisible) failures.push(`Visual frame connector is not immediately visible: ${JSON.stringify(workflowViewsOpened)}`);
    if (!workflowViewsOpened.lookbookView || !workflowViewsOpened.lookbookSpread) failures.push(`Look Book view did not open: ${JSON.stringify(workflowViewsOpened)}`);
    if (workflowViewsOpened.loopListVideoElements !== 0) failures.push(`Loop lists eagerly rendered ${workflowViewsOpened.loopListVideoElements} video elements`);
    if (!workflowViewsOpened.readerMode || !workflowViewsOpened.readerChromeHidden || !workflowViewsOpened.readerNodePanelHidden) failures.push(`Reader mode did not hide admin UI: ${JSON.stringify(workflowViewsOpened)}`);
    if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);

    if (failures.length) {
      console.error(JSON.stringify({ ok: false, failures, metrics, screenshotPath, rigPanelScreenshotPath, loopsScreenshotPath }, null, 2));
      app.exit(1);
      return;
    }

    console.log(JSON.stringify({ ok: true, metrics, screenshotPath, rigPanelScreenshotPath, loopsScreenshotPath }, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
