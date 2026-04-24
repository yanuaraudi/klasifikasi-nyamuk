from flask import Flask, request, jsonify, render_template
from ultralytics import YOLO
from PIL import Image
import io

app = Flask(__name__)

model = YOLO("best.pt")
model.to("cuda")

@app.route('/')
def home():
    return render_template("index.html")

@app.route('/predict', methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    
    file = request.files["image"]
    
    image_bytes = file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    
    results = model(image)
    
    detections = []
    
    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        xyxy = box.xyxy[0].tolist()
        
        detections.append({
            "class_id": cls_id,
            "class_name": model.names[cls_id],
            "confidence": round(conf * 100, 2),
            "box": xyxy
        })
        
        return jsonify({
            "detections": detections
        })

if __name__=='__main__':
    app.run(debug=True)