from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
from datetime import datetime
import re

def scrape_garage():
# Configure Chrome to run in headless mode (background)
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-images")
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("https://osu.campusparc.com/")

    # Wait for and click the "See All Garages" button
    print("Looking for 'See All Garages' button...")
    try:
    # Try multiple possible selectors for the "See All Garages" button
        selectors = [
            "a.cpLink",  # Original selector you provided
            "a[href='#']",  # Generic link with href="#"
            "//a[contains(text(), 'See All Garages')]",  # XPath by text content
            "//a[contains(@class, 'cpLink')]",  # XPath by class
            ".cpLink",  # Class selector
            "[role='button']"  # By role attribute
        ]
    
        button_found = False
    
        for selector in selectors:
            try:
                if selector.startswith("//"):  # XPath selector
                    see_all_button = WebDriverWait(driver, 3).until(
                        EC.element_to_be_clickable((By.XPATH, selector))
                    )
                else:  # CSS selector
                    see_all_button = WebDriverWait(driver, 3).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                    )
            
                print(f"Found button with selector: {selector}")
                print("Clicking 'See All Garages' button...")
                see_all_button.click()
                button_found = True
                break
            
            except:
                continue
    
        if button_found:
            # Wait a moment for the content to load after clicking
            import time
            time.sleep(3)
            print("Button clicked successfully, waiting for content to update...")
        else:
            print("Could not find 'See All Garages' button with any selector")
    
    except Exception as e:
        print(f"Error while trying to click button: {e}")
        print("Proceeding with whatever data is available...")

     #wait until the garageData appears
    print("Waiting for garage data to load...")
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.garageData"))
    )
    soup = BeautifulSoup(driver.page_source, "lxml")
    garage = soup.select_one("div.garageData")

    garage_data = {}
    time_stamp = garage.find('p', class_='lastUpdate')
    timestamp_text = time_stamp.text.strip()
    print(f"Raw timestamp: {timestamp_text}")
    
    # Parse timestamp from "Last Update: 10/25/2025 7:09 PM" format
    try:
        # Extract the datetime part after "Last Update: "
        datetime_str = timestamp_text.replace("Last Update: ", "")
        
        # Parse the datetime string
        parsed_datetime = datetime.strptime(datetime_str, "%m/%d/%Y %I:%M %p")
        
        # Convert to ISO format for SQL database
        sql_timestamp = parsed_datetime.isoformat()
        
        print(f"Parsed datetime: {parsed_datetime}")
        print(f"SQL timestamp: {sql_timestamp}")
        
    except ValueError as e:
        print(f"Error parsing timestamp: {e}")
        # Fallback to current time if parsing fails
        parsed_datetime = datetime.now()
        sql_timestamp = parsed_datetime.isoformat()
        print(f"Using current time as fallback: {sql_timestamp}")

    for data in garage.find('tbody').findAll('tr'):
        cols = data.findAll('td')
        garage_name = cols[0].text.strip()
        if not garage_name.startswith("Carmack") and not garage_name.startswith("Buckeye"):
            garage_name += " Garage"
        occupancy = int(cols[1].text.strip()[:len(cols[1].text.strip()) - 1])
        garage_data[garage_name] = occupancy
    driver.quit()

    return garage_data, sql_timestamp