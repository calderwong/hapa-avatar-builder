import AppKit
import AVFoundation
import Foundation
import Vision

struct Input: Codable { let items: [Item] }
struct Item: Codable { let id: String; let path: String }
struct Rect: Codable { let x: Double; let y: Double; let width: Double; let height: Double }
struct Result: Codable {
    let id: String
    let path: String
    let status: String
    let width: Int
    let height: Int
    let subjectROI: Rect
    let evidence: String
    let faceCount: Int
}

func image(at path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path)
    if ["mp4", "mov", "m4v", "webm"].contains(url.pathExtension.lowercased()) {
        let asset = AVURLAsset(url: url)
        let duration = CMTimeGetSeconds(asset.duration)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 1280)
        return try? generator.copyCGImage(at: CMTime(seconds: max(0, duration * 0.5), preferredTimescale: 600), actualTime: nil)
    }
    return NSImage(contentsOf: url)?.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

func clampRect(_ rect: CGRect) -> Rect {
    let x = max(0, min(1, rect.origin.x))
    let y = max(0, min(1, rect.origin.y))
    let width = max(0.08, min(1 - x, rect.width))
    let height = max(0.08, min(1 - y, rect.height))
    return Rect(x: x, y: y, width: width, height: height)
}

let args = Array(CommandLine.arguments.dropFirst())
guard let inputIndex = args.firstIndex(of: "--input"), args.indices.contains(inputIndex + 1),
      let outputIndex = args.firstIndex(of: "--output"), args.indices.contains(outputIndex + 1) else {
    fputs("usage: analyze-media-roi --input input.json --output output.json\n", stderr)
    exit(2)
}
let input = try JSONDecoder().decode(Input.self, from: Data(contentsOf: URL(fileURLWithPath: args[inputIndex + 1])))
var results: [Result] = []
for item in input.items {
    guard let cgImage = image(at: item.path) else {
        results.append(Result(id: item.id, path: item.path, status: "unreadable", width: 0, height: 0, subjectROI: Rect(x: 0.25, y: 0.2, width: 0.5, height: 0.6), evidence: "center-safe-fallback", faceCount: 0))
        continue
    }
    let face = VNDetectFaceRectanglesRequest()
    let saliency = VNGenerateAttentionBasedSaliencyImageRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
    try? handler.perform([face, saliency])
    let faces = (face.results as? [VNFaceObservation]) ?? []
    let faceUnion = faces.map(\.boundingBox).reduce(nil as CGRect?) { partial, rect in partial?.union(rect) ?? rect }
    let salient = (saliency.results?.first as? VNSaliencyImageObservation)?.salientObjects?.map(\.boundingBox).reduce(nil as CGRect?) { partial, rect in partial?.union(rect) ?? rect }
    let roi = faceUnion ?? salient ?? CGRect(x: 0.25, y: 0.2, width: 0.5, height: 0.6)
    results.append(Result(id: item.id, path: item.path, status: "verified-frame-analysis", width: cgImage.width, height: cgImage.height, subjectROI: clampRect(roi), evidence: faceUnion != nil ? "vision-face-union-mid-frame" : salient != nil ? "vision-attention-saliency-mid-frame" : "center-safe-fallback", faceCount: faces.count))
}
struct ROIEnvelope: Encodable {
    let schemaVersion: String
    let items: [Result]
}
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
try encoder.encode(ROIEnvelope(schemaVersion: "hapa.media-roi-analysis.v1", items: results)).write(to: URL(fileURLWithPath: args[outputIndex + 1]), options: .atomic)
