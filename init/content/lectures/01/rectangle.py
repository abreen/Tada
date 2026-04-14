#
# rectangle.py
#
# Here's vars.foobar: <%= vars.foobar %>
#
class Rectangle:
    """A rectangle with integer side lengths.

    Objects may be mutated by scaling using a scale factor
    (a float between 0 and 1).
    """

    def __init__(self, width: int, height: int):
        self._set_width(width)
        self._set_height(height)

    def _set_width(self, new_width: int):
        if new_width <= 0:
            raise ValueError("width must be positive")
        self._width = new_width

    def _set_height(self, new_height: int):
        if new_height <= 0:
            raise ValueError("height must be positive")
        self._height = new_height

    @property
    def width(self) -> int:
        return self._width

    @property
    def height(self) -> int:
        return self._height

    @property
    def area(self) -> int:
        return self.width * self.height

    def scale_horizontally(self, scale_factor: float):
        self._check_scale_factor(scale_factor)
        self._set_width(round(self.width * scale_factor))

    def scale_vertically(self, scale_factor: float):
        self._check_scale_factor(scale_factor)
        self._set_height(round(self.height * scale_factor))

    @staticmethod
    def _check_scale_factor(scale_factor: float):
        if scale_factor < 0 or scale_factor > 1:
            raise ValueError("scale factor must be between zero and one")
