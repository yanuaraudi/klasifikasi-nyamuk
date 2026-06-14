FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone custom Ultralytics pakcage
RUN git clone https://github.com/yanuaraudi/YOLO11-SimAM.git .

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Build and install custom Ultralytics package layout in editable mode
RUN pip install -e .

# Ensure to use the old Numpy for custom Ultralytics package compatibility
RUN pip install --no-cache-dir "numpy<2.0.0"

COPY app.py .
COPY best.pt .
COPY templates/ ./templates/
COPY static/ ./static/

EXPOSE 7860

RUN chmod -R 777 /app

CMD ["python", "app.py"]