# See README in chat above;

full CRUD routes implemented.
Use JWT with user_id,
run db:setup and db:seed.

curl -s -H "Authorization: Bearer $TOKEN" \
 "http://localhost:7004/images/presign?key=fitness/users/1/recipes/123/cover.jpg&expires=600"
