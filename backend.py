import json
from flask import Flask , request , jsonify
from flask_cors import CORS
#Default Values
heart_rate = 85
SpO2 = 95
blood_Pressure = 120/80
steps = 1000
sleep_hours = 8

sensor_data = {
    "heart_rate": 85,
    "SpO2": 95,
    "steps": 1000,
    "sleep_hours": 8,
     "blood_pressure":{
         "systolic": 120,
         "diastolic": 80
     }
}

def get_sensor_data():
    return sensor_data
print(get_sensor_data())

def validate_data(data):
    required_keys = [
        "heart_rate",
        "SpO2",
        "steps",
        "sleep_hours",
        "blood_pressure",
    ]

    if data is None or not isinstance(data, dict ):
            return False
    for key in required_keys:
            if key not in data:
              return False
            return True

    if validate_data(sensor_data):
            print ("Data is Valid")
    else:
            print ("Data is not Valid")

def update_sensor_data(new_data):
    sensor_data.update(new_data)
    return sensor_data

def process_data(data):
    heart_rate = data ["heart_rate"]
    SpO2 = data ["SpO2"]
    steps = data ["steps"]
    sleep_hours =  data ["sleep_hours"]
    blood_Pressure = data ["blood_pressure"]

    return data

def generate_insights(data):

    insights = []


    heart_rate = data ["heart_rate"]
    SpO2 = data ["SpO2"]
    steps = data ["steps"]
    sleep_hours =  data ["sleep_hours"]
    blood_Pressure = data ["blood_pressure"]

    if (heart_rate > 100):
        insights.append("Heart Rate is Heightend")

        if SpO2 < 95:
            insights.append("SpO2 is Low")

            if sleep_hours < 8:
                insights.append("Sleep Duration is below 8")

                if blood_Pressure > 120/80:
                    insights.append("Blood Pressure is Evelated")

                    if blood_Pressure < 90/60:
                        insights.append("Blood Pressure is Low")
                        return insights

                result = generate_insights(sensor_data)
                print("results")
def get_health_summary(data):

        summary = {
            "sensor_data": data,
            "insights":
            generate_insights(data)
        }
        return summary
data = get_sensor_data()

if validate_data(data):
    updated_sensor_data = process_data(data)
    result = get_health_summary (updated_sensor_data)

print(result)

json_data = json.dumps(sensor_data)
print(json_data)

python_data = json.loads(json_data)
print(python_data)

app = Flask (__name__) 
CORS(app)        

@app.route("/api/sensor_data", methods=["GET"])
def get_data():
     data = sensor_data
     return jsonify(data) 


@app.route("/api/sensor_data", methods=["POST"])
def receive_data():
    data = request.json
    if validate_data(data):
        update_sensor_data(data)

        processed_data = process_data(sensor_data)
        return jsonify({
            "message": "Data Updated Successfully",
            "sensor_data": sensor_data }), 200
    else:
        return jsonify({
            "message": "Error! Data is Invalid"
        }), 400

if __name__ == '__main__':
  app.run(debug=True)


               

 
