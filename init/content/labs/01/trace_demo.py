def sum(n: int):
    if n <= 0:
        return 0
    return n + sum(n - 1)

nums = (pow(2, x) for x in range(7))
first = next(nums)
second = next(nums)

total = sum(4)
print("total", total)
print("nums", first, second)

s = "hello"
for c in s:
    print(c)
