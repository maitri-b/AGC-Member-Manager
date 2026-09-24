def change_month(month):

    if month == "มกราคม":
        digit_month = 1
    elif month == "กุมภาพันธ์":
        digit_month = 2
    elif month == "มีนาคม":
        digit_month = 3
    elif month == "เมษายน":
        digit_month = 4
    elif month == "พฤษภาคม":
        digit_month = 5
    elif month == "มิถุนายน":
        digit_month = 6
    elif month == "กรกฎาคม":
        digit_month = 7  
    elif month == "สิงหาคม":
        digit_month = 8 
    elif month == "กันยายน":
        digit_month = 9 
    elif month == "ตุลาคม":
        digit_month = 10 
    elif month == "พฤศจิกายน":
        digit_month = 11 
    elif month == "ธันวาคม":
        digit_month = 12       

    print(digit_month)
   

month = "ตุลาคม"
change_month(month)
