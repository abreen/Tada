def sum(n: int):
    if n <= 0:
        return 0
    return n + sum(n - 1)


nums = [x for x in range(7)]
for i in range(len(nums)):
    nums[i] = pow(2, i)

total = sum(4)
print("total", total)

s = "hello"
for c in s:
    print(c)
