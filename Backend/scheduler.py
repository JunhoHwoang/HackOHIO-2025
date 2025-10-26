import os
import sys
import datetime
sys.path.append('..')  # Add parent directory to path
from Scraping.scrape_garage import scrape_garage
from CV.run_inference import run_inference
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path="../.env")

url: str = 'https://ibnedqtghbqcyxztepcp.supabase.co'
key: str = os.getenv("SUPABASE_KEY")

if not key:
    raise ValueError("SUPABASE_KEY environment variable is not set. Please set it before running the script.")

supabase: Client = create_client(url, key)

# Run parking slot inference
print("Running parking slot inference...")

#TODO: Update the input with the frames from the security camera and map each camera to parking lot
try:
    # Check if model exists first
    mobilenet_path = "CV/model/mobilenet_v3_small_best.pth"
    
    if os.path.exists(mobilenet_path):
        inference_results = run_inference(
            image_path="CV/test2/test2.png",
            json_path="CV/test2/test_data.json", 
            output_path="CV/test2/output2.json",
            checkpoint_path=mobilenet_path
        )
        print(inference_results)
        try:
            parking_name = 'Stadium Northeast Parking'
            occupied_count = 0
            # Access the 'slots' key from the JSON result
            slots = inference_results.get('slots', [])
            
            for result in slots:
                data = {
                    "spot_id": int(result['id']),
                    "lot_name": parking_name,
                    "is_filled": int(result['occupied']),
                }
                if result['occupied']:
                    occupied_count += 1
                response = supabase.table("parking_spot").upsert(data).execute()
                if len(response.data) > 0:
                    print(f"✅ Updated spot {data['spot_id']}: {'occupied' if data['is_filled'] else 'free'}")
                else:
                    print(f"⚠️  Warning: Could not update spot {data['spot_id']}")

            lot_data = {
                "lot_name": parking_name,
                "occupancy": occupied_count,
                "last_updated": datetime.datetime.now().isoformat()
            }
            response = supabase.table("parking_lot").update(lot_data).eq("lot_name", parking_name).execute()

            if len(response.data) > 0:
                print(f"✅ Updated {parking_name}: {occupied_count} occupied spots")
            else:
                print(f"⚠️  Warning: {parking_name} not found in database")
            
        except Exception as e:
            print(f"❌ Error updating {parking_name}: {e}")

    else:
        print(f"⚠️  MobileNet model not found at {mobilenet_path}")
        inference_results = None
    
except Exception as e:
    print(f"❌ Error running inference: {e}")
    inference_results = None

print("\n" + "="*50)
print("Scraping garage data...")

#TODO: Use campusparc API instead of scraping if possible
garage_data, last_updated = scrape_garage()
print(f"Found data for {len(garage_data)} garages")
print(f"Data last updated: {last_updated}")

capacity = supabase.table("parking_lot").select("lot_name, capacity").execute().data
capacity_dict = {item['lot_name']: item['capacity'] for item in capacity}

for garage_name, occupancy in garage_data.items():
    data = {
        "occupancy": round(occupancy/100 * capacity_dict.get(garage_name, 0)),
        "last_updated": last_updated  # Add timestamp to database
    }
    
    try:
        response = supabase.table("parking_lot").update(data).eq("lot_name", garage_name).execute()
      
        if len(response.data) > 0:
            print(f"✅ Updated {garage_name}: {data['occupancy']}")
        else:
            print(f"⚠️  Warning: {garage_name} not found in database")
            
    except Exception as e:
        print(f"❌ Error updating {garage_name}: {e}")

print("Database update completed!")