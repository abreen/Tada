def evens(end):
    return [n for n in range(1, end) if n % 2 == 0]

def odds(end):
    return [n for n in range(1, end) if n % 2 == 1]

print('Hello, world!')
print(evens(10))
print(odds(10))
