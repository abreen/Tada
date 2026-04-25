def swap(items, i, j):
    temp = items[i]
    items[i] = items[j]
    items[j] = temp


def index_smallest(nums, start):
    curr = start
    for i in range(start + 1, len(nums)):
        if nums[i] < nums[curr]:
            curr = i

    return curr


def selection(nums):
    for i in range(len(nums) - 1):
        swap(nums, i, index_smallest(nums, i))


input1 = [25, 31, 12, 9]
selection(input1)
print(input1)
