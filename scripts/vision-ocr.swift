import AppKit
import Foundation
import Vision

func jsonData(_ value: Any) -> Data {
  return (try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])) ?? Data("[]".utf8)
}

func cgImageForPath(_ path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  guard let image = NSImage(contentsOf: url) else { return nil }
  guard let tiff = image.tiffRepresentation else { return nil }
  guard let bitmap = NSBitmapImageRep(data: tiff) else { return nil }
  return bitmap.cgImage
}

let paths = Array(CommandLine.arguments.dropFirst())
var payload: [[String: Any]] = []

for path in paths {
  guard let cgImage = cgImageForPath(path) else {
    payload.append([
      "path": path,
      "error": "image_decode_failed",
      "text": "",
      "lines": []
    ])
    continue
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = ["en-US"]
  request.minimumTextHeight = 0.004

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
    let observations = (request.results ?? []).sorted { left, right in
      let dy = abs(left.boundingBox.midY - right.boundingBox.midY)
      if dy > 0.012 {
        return left.boundingBox.midY > right.boundingBox.midY
      }
      return left.boundingBox.minX < right.boundingBox.minX
    }
    let lines = observations.compactMap { observation -> [String: Any]? in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "box": [
          "x": Double(observation.boundingBox.minX),
          "y": Double(observation.boundingBox.minY),
          "width": Double(observation.boundingBox.width),
          "height": Double(observation.boundingBox.height)
        ]
      ]
    }
    let text = lines.compactMap { $0["text"] as? String }.joined(separator: "\n")
    let confidenceValues = lines.compactMap { $0["confidence"] as? Double }
    let averageConfidence = confidenceValues.isEmpty
      ? 0.0
      : confidenceValues.reduce(0.0, +) / Double(confidenceValues.count)
    payload.append([
      "path": path,
      "engine": "apple-vision",
      "confidence": averageConfidence,
      "text": text,
      "lines": lines
    ])
  } catch {
    payload.append([
      "path": path,
      "engine": "apple-vision",
      "error": String(describing: error),
      "text": "",
      "lines": []
    ])
  }
}

FileHandle.standardOutput.write(jsonData(payload))
