import XCTest

final class SignatureQABridge: XCTestCase {
 func request(_ path: String, _ body: Data? = nil) throws -> Data {
  var req = URLRequest(url: URL(string: "http://127.0.0.1:5058" + path)!)
  req.timeoutInterval = 10
  if let body { req.httpMethod = "POST"; req.httpBody = body }
  let semaphore = DispatchSemaphore(value: 0)
  var result: Result<Data,Error>!
  URLSession.shared.dataTask(with: req) { data, _, error in
   result = error.map { .failure($0) } ?? .success(data ?? Data()); semaphore.signal()
  }.resume()
  _ = semaphore.wait(timeout: .now() + 12)
  return try result.get()
 }
 func testInteractiveSyntheticOnly() throws {
  continueAfterFailure = false
  let app = XCUIApplication(bundleIdentifier: "com.melamedia.MelamediaShowcase")
  app.launch()
  for _ in 0..<3600 {
   let data = try request("/next")
   let command = try JSONSerialization.jsonObject(with: data) as! [String:Any]
   let action = command["action"] as? String ?? "wait"
   if action == "wait" { Thread.sleep(forTimeInterval: 1); continue }
   if action == "stop" { break }
   let label = command["label"] as? String ?? ""
   let element = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ OR identifier == %@", label, label)).firstMatch
   switch action {
    case "launch": app.launch()
    case "input": app.typeText(command["text"] as! String)
    case "systemTap": XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons[label].tap()
    case "tap": XCTAssertTrue(element.waitForExistence(timeout: 10)); element.tap()
    case "type": XCTAssertTrue(element.waitForExistence(timeout: 10)); element.tap(); app.typeText(command["text"] as! String)
    case "otp":
     let code = String(data: try request("/otp"), encoding: .utf8)!.trimmingCharacters(in: .whitespacesAndNewlines)
     element.tap(); app.typeText(code)
    case "drag":
     let origin = app.coordinate(withNormalizedOffset: .zero)
     let from = origin.withOffset(CGVector(dx: command["x1"] as! Double, dy: command["y1"] as! Double))
     let to = origin.withOffset(CGVector(dx: command["x2"] as! Double, dy: command["y2"] as! Double))
     from.press(forDuration: 0.1, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.1)
    case "tapPoint": app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: command["x"] as! Double, dy: command["y"] as! Double)).tap()
    case "inspect": break
    default: XCTFail("Unknown QA action")
   }
   Thread.sleep(forTimeInterval: 1)
   let payload: [String:Any] = ["id":command["id"] ?? "", "tree":app.debugDescription,"image":XCUIScreen.main.screenshot().pngRepresentation.base64EncodedString()]
   _ = try request("/result", JSONSerialization.data(withJSONObject: payload))
  }
 }
}
