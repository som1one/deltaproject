MVP 

модели:

Users

id : uuid
name : str
email : email
telegram : str
hash_pass : str
percent : float
balance : int
role : enum(Worker,Bloger, Admin)
linked_to : id

Ref system

id : uuid
user_id : relationship users(id)
link : str

worker_stat 

id : uuid
user_id : relationship users(id)
deals : int
agree : int
paid : float
earn : float

bloger_stat 

id : uuid
user_id : relationship users(id)
deals : int
earn : float
workers : int

deals:

id : uuid 
bloger_id relationship users(id)
shop_link : str
item_name : str
status: enum(AGREE,PAID,CLOSE)
price : float
seller_tg :str
seller_ number : str


Session

id : uuid
ip : ip
agent : str




MODULES

auth

POST /register

получаем:
name
username
email 
telegram | None
pass
role

проверяем на занятость почту 
сохраняем

отдаем JWT, refresh_token

ошибки 403 400

POST login

получаем: email/ telegram
получаем password

сверяем пароль с хэшами 

если ок, даем JWT и refresh

ошибки 401 и 404

/refresh 

получаем рефреш токен

сверяем и отдаем актуальный JWT

ошибки 401 403


me

GET /me 

получаем jwt 
проверяем
отдаем инфу

ошибки 401 404 403

PATCH /me

получаем jwt
получаем инфу что меняем

проверяем токен
меняем инфу

ошибки 401 404 403 


GET /me/stats 

проверяем jwt и отдаем стату

ошибки 401 403 404


GET /me/referal/username

отдаем ссылку

ошибки 404

deals

GET /deals/{id}

проверяем jwt
доступ к сделке 
отдаем инфу о сделке 


ошибки 401 403 400


POST /deals/

проверяем jwt
проверяем роль
получаем:
ссылка на магазин продавца
название товара
контакт продавца
цена интеграции
выбранный блогер


